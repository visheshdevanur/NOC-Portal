import { useState, useEffect } from 'react';
import { getActivityLogs } from '../lib/api';
import { Activity, Search, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Logs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const data = await getActivityLogs();
      setLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => 
    l.action?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.details?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div>
          <button 
            onClick={() => navigate(-1)} 
            className="mb-4 flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors font-medium bg-secondary/50 px-3 py-1.5 rounded-lg w-max"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
            <ShieldCheck className="w-8 h-8 mr-3 text-primary" />
            System Activity Logs
          </h1>
          <p className="text-muted-foreground">Monitor and track system operations and audit trails.</p>
        </div>
      </div>

      <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
        <div className="relative mb-6">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search logs by action, user, or details..."
            className="pl-10 pr-4 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-md"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          {loading ? (
             <div className="p-8 text-center text-muted-foreground animate-pulse">Loading activity logs...</div>
          ) : filteredLogs.length === 0 ? (
             <div className="p-12 text-center flex flex-col items-center">
               <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                 <Activity className="w-10 h-10 text-muted-foreground/50" />
               </div>
               <h3 className="text-xl font-bold text-foreground">No Activity Logs Found</h3>
               <p className="text-muted-foreground mt-2">You don't have any recorded logs to view matching your criteria.</p>
             </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                  <th className="p-4 font-semibold">User</th>
                  <th className="p-4 font-semibold">Role</th>
                  <th className="p-4 font-semibold">Action</th>
                  <th className="p-4 font-semibold w-1/3">Details</th>
                  <th className="p-4 font-semibold text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-4 font-medium text-foreground">{log.user_name || 'System User'}</td>
                    <td className="p-4">
                       <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-secondary text-foreground/70">
                         {log.user_role || 'Unknown'}
                       </span>
                    </td>
                    <td className="p-4 font-bold text-foreground">{log.action}</td>
                    <td className="p-4 text-sm text-muted-foreground max-w-sm xl:max-w-md truncate" title={log.details || ''}>{log.details || '—'}</td>
                    <td className="p-4 text-sm text-muted-foreground text-right whitespace-nowrap">
                       {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
