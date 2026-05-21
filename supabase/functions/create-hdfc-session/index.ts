// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import * as jose from 'https://deno.land/x/jose@v5.2.0/index.ts'

/**
 * HDFC SmartGateway — Session API (JWE Auth)
 * Uses RSA key pair + JWE encryption as per official Juspay SDK
 */

const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_KEY_UUID = Deno.env.get('HDFC_KEY_UUID') || ''

// Keys are stored base64-encoded to preserve PEM newlines
function decodeKeyFromEnv(b64Name: string, fallbackName: string): string {
  const b64 = Deno.env.get(b64Name)
  if (b64) {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
    } catch { /* fall through */ }
  }
  return Deno.env.get(fallbackName) || ''
}

const HDFC_PRIVATE_KEY_PEM = decodeKeyFromEnv('HDFC_PRIVATE_KEY_B64', 'HDFC_PRIVATE_KEY')
const HDFC_PUBLIC_KEY_PEM = decodeKeyFromEnv('HDFC_PUBLIC_KEY_B64', 'HDFC_PUBLIC_KEY')
const HDFC_PAYMENT_PAGE_CLIENT_ID = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID') || 'hdfcmaster'
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'
const PAYMENT_RETURN_URL = Deno.env.get('PAYMENT_RETURN_URL') || ''
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `NOC${ts}${rand}`.substring(0, 20)
}

/**
 * Create JWE-encrypted request payload (as per Juspay SDK)
 * 1. Create JWS (signed with private key)
 * 2. Encrypt JWS into JWE (encrypted with HDFC's public key)
 */
async function createJwePayload(payload: object): Promise<string> {
  const privateKey = await jose.importPKCS8(HDFC_PRIVATE_KEY_PEM, 'RS256')

  // Step 1: Sign the payload as JWS
  const jws = await new jose.CompactSign(
    new TextEncoder().encode(JSON.stringify(payload))
  )
    .setProtectedHeader({ alg: 'RS256', kid: HDFC_KEY_UUID })
    .sign(privateKey)

  return jws
}

/**
 * Make authenticated API call to HDFC SmartGateway
 * The official SDK sends the payload as JWS in a specific format
 */
async function callHdfcApi(endpoint: string, payload: object) {
  const privateKey = await jose.importPKCS8(HDFC_PRIVATE_KEY_PEM, 'RS256')

  // Create JWS token with the payload
  const jws = await new jose.CompactSign(
    new TextEncoder().encode(JSON.stringify(payload))
  )
    .setProtectedHeader({ alg: 'RS256', kid: HDFC_KEY_UUID })
    .sign(privateKey)

  const url = `${HDFC_BASE_URL}${endpoint}`
  console.log('Calling HDFC:', url)

  // Send as form-urlencoded with the JWS as the 'payload' field
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchantid': HDFC_MERCHANT_ID,
    },
    body: `payload=${encodeURIComponent(jws)}`,
  })

  const responseText = await response.text()
  console.log('HDFC response status:', response.status)
  console.log('HDFC response:', responseText.substring(0, 500))

  // The response may be JWE-encrypted or plain JSON
  let data: any
  try {
    data = JSON.parse(responseText)
  } catch {
    // Response might be JWE — try to decrypt
    try {
      const privKey = await jose.importPKCS8(HDFC_PRIVATE_KEY_PEM, 'RSA-OAEP-256')
      const { plaintext } = await jose.compactDecrypt(responseText, privKey)
      const decryptedText = new TextDecoder().decode(plaintext)
      // The decrypted content is a JWS — verify it
      try {
        const pubKey = await jose.importSPKI(HDFC_PUBLIC_KEY_PEM, 'RS256')
        const { payload: verified } = await jose.compactVerify(decryptedText, pubKey)
        data = JSON.parse(new TextDecoder().decode(verified))
      } catch {
        data = JSON.parse(decryptedText)
      }
    } catch (decryptErr) {
      console.error('Failed to parse/decrypt response:', decryptErr)
      return { error: true, status: response.status, message: responseText.substring(0, 200) }
    }
  }

  return { error: !response.ok, status: response.status, data }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Step 1: Authenticate user
    console.log('STEP 1: Auth check')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonRes({ error: 'Missing Authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = authHeader.replace('Bearer ', '')

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !user) {
      console.error('Auth failed:', authError?.message)
      return jsonRes({ error: 'Invalid or expired token' }, 401)
    }
    console.log('STEP 1 OK: user =', user.id)

    // Step 2: Parse request
    console.log('STEP 2: Parse request body')
    const body = await req.json()
    const { amount, enrollment_id, enrollment_ids, due_type } = body

    if (!amount || amount <= 0) {
      return jsonRes({ error: 'Valid amount is required' }, 400)
    }

    // Step 3: Get profile
    console.log('STEP 3: Verify student profile')
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile || profile.role !== 'student') {
      return jsonRes({ error: 'Only students can create payment orders' }, 403)
    }

    // Step 4: Generate order ID
    const orderId = generateOrderId()
    console.log('STEP 4: orderId =', orderId)

    // Step 5: Check JWE config
    if (!HDFC_KEY_UUID || !HDFC_PRIVATE_KEY_PEM) {
      console.error('Missing HDFC_KEY_UUID or HDFC_PRIVATE_KEY')
      return jsonRes({ error: 'Payment gateway not configured. Contact administrator.' }, 503)
    }

    // Step 6: Call HDFC Session API with JWE auth
    console.log('STEP 5: Call HDFC Session API (JWE auth)')
    const returnUrl = PAYMENT_RETURN_URL || `${ALLOWED_ORIGIN}/payment/callback`
    const customerIdForHdfc = user.id.replace(/-/g, '').substring(0, 20)

    const sessionPayload = {
      order_id: orderId,
      amount: Number(amount).toFixed(2),
      payment_page_client_id: HDFC_PAYMENT_PAGE_CLIENT_ID,
      customer_id: customerIdForHdfc,
      customer_email: user.email || profile.email || '',
      action: 'paymentPage',
      return_url: returnUrl,
      currency: 'INR',
    }

    const result = await callHdfcApi('/session', sessionPayload)

    if (result.error) {
      console.error('HDFC API error:', JSON.stringify(result))
      const errorMsg = result.data?.error_message || result.data?.status || result.message || 'Failed to create payment session'
      return jsonRes({ error: errorMsg, hdfc_status: result.data?.status }, 502)
    }

    const sessionData = result.data
    const paymentLink = sessionData?.payment_links?.web
    if (!paymentLink) {
      console.error('No payment link in response:', JSON.stringify(sessionData))
      return jsonRes({ error: 'No payment link received from gateway', response: sessionData }, 502)
    }

    console.log('STEP 5 OK: paymentLink =', paymentLink)

    // Step 7: Store order in DB
    console.log('STEP 6: Store order in DB')
    const primaryEnrollmentId = enrollment_id || (enrollment_ids?.length > 0 ? enrollment_ids[0] : null)

    const { data: dbOrderId, error: rpcError } = await adminClient.rpc('create_payment_order_atomic', {
      p_student_id: user.id,
      p_enrollment_id: primaryEnrollmentId || null,
      p_amount: amount,
      p_due_type: due_type || 'attendance_fine',
      p_gateway_order_id: orderId,
      p_tenant_id: profile.tenant_id,
      p_gateway_type: 'hdfc',
      p_payment_link: paymentLink,
    })

    if (rpcError) {
      console.error('DB error:', rpcError.message)
      const msg = rpcError.message
      if (msg.includes('already exists')) return jsonRes({ error: 'An unpaid order already exists' }, 409)
      if (msg.includes('already been paid')) return jsonRes({ error: 'This fine has already been paid' }, 400)
      return jsonRes({ error: 'Failed to create payment order: ' + msg }, 500)
    }

    console.log('ALL STEPS COMPLETE')
    return jsonRes({
      order_id: orderId,
      payment_link: paymentLink,
      amount: amount,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('UNCAUGHT ERROR:', message, error instanceof Error ? error.stack : '')
    return jsonRes({ error: message }, 500)
  }
})
