import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { supabase } from './supabase';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  admin_email: string;
  max_users: number;
  logo_url: string | null;
  primary_color: string | null;
  created_at: string;
};

type TenantContextType = {
  tenantId: string | null;
  tenant: Tenant | null;
  loading: boolean;
};

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenant: null,
  loading: true,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Get tenant_id from the user's profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single();

        if (profile?.tenant_id) {
          setTenantId(profile.tenant_id);

          // Fetch full tenant details
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profile.tenant_id)
            .single();

          if (tenantData) {
            setTenant(tenantData as Tenant);
          }
        }
      } catch (err) {
        console.error('Error fetching tenant:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();

    // Re-fetch when auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchTenant();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <TenantContext.Provider value={{ tenantId, tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Hook to access the current user's tenant context.
 * Returns tenantId, full tenant object, and loading state.
 */
export function useTenant() {
  return useContext(TenantContext);
}
