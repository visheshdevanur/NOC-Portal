import { useState, useEffect } from 'react';
import { type Tenant, getTenantDetails, toggleTenantStatus, editTenant, deleteTenant, requestTenantDeletion, cancelTenantDeletion } from '../../lib/superAdminApi';
import { X, Building2, Users, FileCheck, Power, Shield, Clock, Mail, Tag, Crown, ChevronLeft, Save, Pencil, Loader2, Trash2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

type TenantUser = { id: string; full_name: string; role: string; roll_number: string | null; section: string | null; created_at: string };
type ViewMode = 'detail' | 'edit' | 'role-users';
const s = (obj: Record<string, any>) => obj as React.CSSProperties;

export default function TenantDetailModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [clearanceCount, setClearanceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState(tenant.status);
  const [view, setView] = useState<ViewMode>('detail');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [editName, setEditName] = useState(tenant.name);
  const [editPlan, setEditPlan] = useState(tenant.plan);
  const [editMaxUsers, setEditMaxUsers] = useState(tenant.max_users);
  const [editAdminEmail, setEditAdminEmail] = useState(tenant.admin_email);
  const [editSlug, setEditSlug] = useState(tenant.slug);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const details = await getTenantDetails(tenant.id) as any;
        const allUsers: TenantUser[] = [];
        // Build user list from role counts (details endpoint returns counts)
        setUsers(allUsers);
        setClearanceCount(details?.totalClearances || 0);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [tenant.id]);

  const handleToggle = async () => { setToggling(true); try { const ns = status === 'active' ? 'suspended' as const : 'active' as const; await toggleTenantStatus(tenant.id, ns); setStatus(ns); } catch {} finally { setToggling(false); } };
  const handleSave = async () => { setSaving(true); setSaveMsg(null); try { await editTenant(tenant.id, { name: editName, slug: editSlug, plan: editPlan, max_users: editMaxUsers, admin_email: editAdminEmail }); setSaveMsg({ type: 'ok', text: 'Saved!' }); setTimeout(() => { setSaveMsg(null); setView('detail'); }, 1000); } catch (err: any) { setSaveMsg({ type: 'err', text: err.message }); } finally { setSaving(false); } };

  const handleRequestDeletion = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await requestTenantDeletion(tenant.id);
      setStatus('pending_deletion');
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to request deletion');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await cancelTenantDeletion(tenant.id);
      setStatus('active');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to cancel deletion');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (deleteConfirmText !== tenant.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTenant(tenant.id);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete tenant. Admin approval may be required.');
    } finally {
      setDeleting(false);
    }
  };

  const isDeletionApproved = !!tenant.deletion_approved_at;

  const roleCounts: Record<string, number> = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });
  const roleUsers = selectedRole ? users.filter(u => u.role === selectedRole) : [];

  const modal = s({ position: 'fixed', inset: 0, background: 'var(--sa-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 });
  const card = s({ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 16, width: '100%', boxShadow: 'var(--sa-shadow-lg)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' as const });
  const closeBtn = s({ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 8, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sa-text-muted)', zIndex: 10 });
  const backBtn = s({ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sa-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10, fontWeight: 500 });
  const inp = s({ width: '100%', padding: '10px 14px', background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 10, color: 'var(--sa-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const });
  const lbl = s({ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 });

  // ─── ROLE USERS ───
  if (view === 'role-users' && selectedRole) {
    return (
      <div style={modal}><div style={{ ...card, maxWidth: 560 }}>
        <button onClick={onClose} style={closeBtn}><X size={14} /></button>
        <div style={s({ padding: '18px 24px', borderBottom: '1px solid var(--sa-border)' })}>
          <button onClick={() => { setView('detail'); setSelectedRole(null); }} style={backBtn}><ChevronLeft size={14} /> Back</button>
          <div style={s({ display: 'flex', alignItems: 'center', gap: 10 })}>
            <div style={s({ width: 34, height: 34, borderRadius: 9, background: '#7c3aed18', display: 'flex', alignItems: 'center', justifyContent: 'center' })}><Shield size={16} color="#7c3aed" /></div>
            <div>
              <h2 style={s({ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--sa-text)', textTransform: 'capitalize' as const })}>{selectedRole}s</h2>
              <p style={s({ fontSize: 11, color: 'var(--sa-text-muted)', margin: 0 })}>{roleUsers.length} users · {tenant.name}</p>
            </div>
          </div>
        </div>
        <div style={s({ padding: 20 })}>
          {roleUsers.length === 0 ? <p style={s({ textAlign: 'center', color: 'var(--sa-text-muted)', fontSize: 13, padding: '24px 0' })}>No users</p> : (
            <div style={s({ display: 'flex', flexDirection: 'column', gap: 6 })}>
              {roleUsers.map(u => (
                <div key={u.id} style={s({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10 })}>
                  <div style={s({ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 })}>
                    <div style={s({ width: 30, height: 30, borderRadius: 8, background: '#7c3aed12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#7c3aed' })}>{u.full_name?.[0]?.toUpperCase() || '?'}</div>
                    <div style={s({ minWidth: 0 })}>
                      <div style={s({ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{u.full_name}</div>
                      {u.roll_number && <div style={s({ fontSize: 10, color: 'var(--sa-text-muted)', fontFamily: 'monospace' })}>{u.roll_number}</div>}
                    </div>
                  </div>
                  <div style={s({ fontSize: 11, color: 'var(--sa-text-muted)', flexShrink: 0 })}>{u.section ? `Sec ${u.section}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div></div>
    );
  }

  // ─── EDIT ───
  if (view === 'edit') {
    return (
      <div style={modal}><div style={{ ...card, maxWidth: 460 }}>
        <button onClick={onClose} style={closeBtn}><X size={14} /></button>
        <div style={s({ padding: '18px 24px', borderBottom: '1px solid var(--sa-border)' })}>
          <button onClick={() => setView('detail')} style={backBtn}><ChevronLeft size={14} /> Back</button>
          <div style={s({ display: 'flex', alignItems: 'center', gap: 10 })}>
            <div style={s({ width: 34, height: 34, borderRadius: 9, background: '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center' })}><Pencil size={16} color="#f59e0b" /></div>
            <h2 style={s({ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--sa-text)' })}>Edit Tenant</h2>
          </div>
        </div>
        <div style={s({ padding: 24 })}>
          {saveMsg && <div style={s({ marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: saveMsg.type === 'ok' ? '#05966912' : '#dc262612', color: saveMsg.type === 'ok' ? 'var(--sa-success)' : 'var(--sa-danger)', border: `1px solid ${saveMsg.type === 'ok' ? '#05966920' : '#dc262620'}` })}>{saveMsg.text}</div>}
          {[
            { l: 'Name', v: editName, set: setEditName },
            { l: 'Slug', v: editSlug, set: setEditSlug, mono: true },
            { l: 'Admin Email', v: editAdminEmail, set: setEditAdminEmail, type: 'email' },
          ].map(f => (
            <div key={f.l} style={s({ marginBottom: 14 })}>
              <div style={lbl}>{f.l}</div>
              <input value={f.v} onChange={e => f.set(e.target.value)} type={f.type || 'text'} style={{ ...inp, ...(f.mono ? { fontFamily: 'monospace', color: '#7c3aed' } : {}) }} />
            </div>
          ))}
          <div style={s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 })}>
            <div><div style={lbl}>Plan</div><select value={editPlan} onChange={e => setEditPlan(e.target.value)} style={{ ...inp, appearance: 'none' as any }}><option value="free">Free</option><option value="standard">Standard</option><option value="premium">Premium</option></select></div>
            <div><div style={lbl}>Max Users</div><input type="number" value={editMaxUsers} onChange={e => setEditMaxUsers(Number(e.target.value))} style={inp} /></div>
          </div>
          <div style={s({ display: 'flex', gap: 10 })}>
            <button onClick={() => setView('detail')} style={s({ flex: 1, padding: 11, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 13, fontWeight: 500 })}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={s({ flex: 1, padding: 11, background: '#f59e0b', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'white', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 })}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div></div>
    );
  }

  // ─── DETAIL ───
  return (
    <div style={modal}><div style={{ ...card, maxWidth: 600 }}>
      <button onClick={onClose} style={closeBtn}><X size={14} /></button>
      {/* Header */}
      <div style={s({ padding: '20px 24px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'flex-start', gap: 14 })}>
        <div style={s({ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 })}><Building2 size={20} color="white" /></div>
        <div style={s({ flex: 1, minWidth: 0 })}>
          <h2 style={s({ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--sa-text)' })}>{editName}</h2>
          <div style={s({ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' })}>
            <code style={s({ fontSize: 11, background: 'var(--sa-bg-elevated)', padding: '2px 8px', borderRadius: 6, color: '#7c3aed', fontFamily: 'monospace' })}>{editSlug}</code>
            <span style={s({ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: status === 'active' ? '#05966915' : '#dc262615', color: status === 'active' ? 'var(--sa-success)' : 'var(--sa-danger)', display: 'inline-flex', alignItems: 'center', gap: 4 })}>
              <span style={s({ width: 5, height: 5, borderRadius: '50%', background: status === 'active' ? 'var(--sa-success)' : 'var(--sa-danger)' })} />{status}
            </span>
            <span style={s({ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: editPlan === 'premium' ? '#f59e0b15' : editPlan === 'standard' ? '#3b82f615' : 'var(--sa-bg-elevated)', color: editPlan === 'premium' ? '#f59e0b' : editPlan === 'standard' ? '#3b82f6' : 'var(--sa-text-muted)' })}>{editPlan}</span>
          </div>
        </div>
        <button onClick={() => setView('edit')} style={s({ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: '#f59e0b15', border: '1px solid #f59e0b25', color: '#f59e0b', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 })}>
          <Pencil size={12} /> Edit
        </button>
      </div>

      <div style={s({ padding: '20px 24px' })}>
        {/* Stats */}
        <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 })}>
          {[
            { icon: Users, label: 'Users', value: loading ? '—' : users.length, color: '#3b82f6' },
            { icon: FileCheck, label: 'Clearances', value: loading ? '—' : clearanceCount, color: '#059669' },
            { icon: Crown, label: 'Max', value: editMaxUsers, color: '#f59e0b' },
            { icon: Clock, label: 'Created', value: new Date(tenant.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), color: '#7c3aed' },
          ].map(c => (
            <div key={c.label} style={s({ background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' })}>
              <c.icon size={14} color={c.color} style={s({ marginBottom: 4, display: 'inline-block' })} />
              <div style={s({ fontSize: 18, fontWeight: 800, color: 'var(--sa-text)', lineHeight: 1.2 })}>{c.value}</div>
              <div style={s({ fontSize: 9, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 })}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div style={s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 })}>
          {[{ icon: Mail, color: '#3b82f6', l: 'Admin Email', v: editAdminEmail }, { icon: Tag, color: '#7c3aed', l: 'Tenant ID', v: tenant.id.slice(0, 12) + '...' }].map(d => (
            <div key={d.l} style={s({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10 })}>
              <d.icon size={14} color={d.color} />
              <div style={s({ minWidth: 0 })}>
                <div style={s({ fontSize: 9, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' })}>{d.l}</div>
                <div style={s({ fontSize: 12, fontWeight: 500, color: 'var(--sa-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{d.v}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Roles */}
        {!loading && Object.keys(roleCounts).length > 0 && (
          <div style={s({ background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, padding: 14, marginBottom: 16 })}>
            <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 })}>Roles — click to view</div>
            <div style={s({ display: 'flex', flexWrap: 'wrap', gap: 6 })}>
              {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                <button key={role} onClick={() => { setSelectedRole(role); setView('role-users'); }}
                  style={s({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 7, fontSize: 11, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontWeight: 500, transition: 'all 0.15s' })}>
                  <Shield size={10} color="#7c3aed" />
                  <span style={s({ textTransform: 'capitalize' })}>{role}</span>
                  <span style={s({ fontWeight: 800, color: 'var(--sa-text)' })}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={s({ display: 'flex', gap: 10 })}>
          <button onClick={handleToggle} disabled={toggling} style={s({ flex: 1, padding: 11, borderRadius: 10, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', border: `1px solid ${status === 'active' ? '#dc262620' : '#05966920'}`, background: status === 'active' ? '#dc262608' : '#05966908', color: status === 'active' ? 'var(--sa-danger)' : 'var(--sa-success)', opacity: toggling ? 0.5 : 1 })}>
            <Power size={14} /> {toggling ? 'Updating...' : status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
          <button onClick={onClose} style={s({ flex: 1, padding: 11, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 13, fontWeight: 500 })}>Close</button>
        </div>

        {/* Delete Tenant Section */}
        <div style={s({ marginTop: 16, padding: 16, background: '#dc262608', border: '1px solid #dc262620', borderRadius: 12 })}>
          {deleteError && (
            <div style={s({ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: '#dc262612', color: 'var(--sa-danger)', border: '1px solid #dc262620', marginBottom: 10 })}>{deleteError}</div>
          )}

          {/* State 1: Not yet requested — show Request Deletion button */}
          {status !== 'pending_deletion' && !showDeleteConfirm && (
            <button onClick={() => setShowDeleteConfirm(true)} style={s({ width: '100%', padding: 11, borderRadius: 10, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', border: '1px solid #dc262630', background: '#dc262610', color: 'var(--sa-danger)', transition: 'all 0.2s' })}>
              <Trash2 size={14} /> Request Tenant Deletion
            </button>
          )}

          {/* Confirm request */}
          {status !== 'pending_deletion' && showDeleteConfirm && (
            <div>
              <div style={s({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 })}>
                <AlertTriangle size={16} color="#dc2626" />
                <span style={s({ fontSize: 13, fontWeight: 700, color: 'var(--sa-danger)' })}>Request Tenant Deletion</span>
              </div>
              <p style={s({ fontSize: 12, color: 'var(--sa-text-muted)', margin: '0 0 12px', lineHeight: 1.5 })}>
                This will send a deletion request to the tenant admin of <strong style={s({ color: 'var(--sa-text)' })}>{tenant.name}</strong>. The admin must approve the request before the tenant can be permanently deleted.
              </p>
              <div style={s({ display: 'flex', gap: 10 })}>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} style={s({ flex: 1, padding: 10, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 12, fontWeight: 500 })}>Cancel</button>
                <button onClick={handleRequestDeletion} disabled={deleting} style={s({ flex: 1, padding: 10, background: '#dc2626', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'white', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: deleting ? 0.5 : 1 })}>
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                  {deleting ? 'Requesting...' : 'Send Deletion Request'}
                </button>
              </div>
            </div>
          )}

          {/* State 2: Pending — waiting for admin approval */}
          {status === 'pending_deletion' && !isDeletionApproved && (
            <div>
              <div style={s({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 })}>
                <Clock size={16} color="#f59e0b" />
                <span style={s({ fontSize: 13, fontWeight: 700, color: '#f59e0b' })}>Awaiting Admin Approval</span>
              </div>
              <p style={s({ fontSize: 12, color: 'var(--sa-text-muted)', margin: '0 0 12px', lineHeight: 1.5 })}>
                Deletion request has been sent. The tenant admin (<strong style={s({ color: 'var(--sa-text)' })}>{tenant.admin_email}</strong>) must approve the deletion from their dashboard before you can proceed.
              </p>
              <button onClick={handleCancelDeletion} disabled={deleting} style={s({ width: '100%', padding: 10, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
                <XCircle size={14} /> {deleting ? 'Cancelling...' : 'Cancel Deletion Request'}
              </button>
            </div>
          )}

          {/* State 3: Admin approved — SuperAdmin can now delete */}
          {status === 'pending_deletion' && isDeletionApproved && (
            <div>
              <div style={s({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 })}>
                <CheckCircle2 size={16} color="#059669" />
                <span style={s({ fontSize: 13, fontWeight: 700, color: 'var(--sa-success)' })}>Admin Approved Deletion</span>
              </div>
              <p style={s({ fontSize: 12, color: 'var(--sa-text-muted)', margin: '0 0 8px', lineHeight: 1.5 })}>
                The tenant admin has approved the deletion. Type the tenant name to permanently delete all data.
              </p>
              <div style={s({ fontSize: 11, fontWeight: 600, color: 'var(--sa-text-muted)', marginBottom: 6 })}>
                Type <strong style={s({ color: 'var(--sa-danger)', fontFamily: 'monospace' })}>{tenant.name}</strong> to confirm:
              </div>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={tenant.name}
                style={s({ width: '100%', padding: '10px 14px', background: 'var(--sa-bg-input)', border: '1px solid #dc262630', borderRadius: 10, color: 'var(--sa-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 10 })}
              />
              <div style={s({ display: 'flex', gap: 10 })}>
                <button onClick={handleCancelDeletion} disabled={deleting} style={s({ flex: 1, padding: 10, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 12, fontWeight: 500 })}>Cancel</button>
                <button
                  onClick={handleDeleteTenant}
                  disabled={deleting || deleteConfirmText !== tenant.name}
                  style={s({ flex: 1, padding: 10, background: deleteConfirmText === tenant.name ? '#dc2626' : '#dc262650', border: 'none', borderRadius: 10, cursor: deleteConfirmText === tenant.name ? 'pointer' : 'not-allowed', color: 'white', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: deleting ? 0.5 : 1, transition: 'all 0.2s' })}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div></div>
  );
}
