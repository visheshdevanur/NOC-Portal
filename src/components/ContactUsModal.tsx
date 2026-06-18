import React from 'react';
import { X, Mail } from 'lucide-react';

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const DEVELOPERS = [
  { name: 'Vishesh G Devanur', initials: 'VD', linkedin: 'https://www.linkedin.com/in/vishesh-g-devanur-969625414' },
  { name: 'Varshith V', initials: 'VV', linkedin: 'https://www.linkedin.com/in/varshith-v-812585275' },
  { name: 'Vinod Patel', initials: 'VP', linkedin: 'https://www.linkedin.com/in/vinod-patel-aab6a53a6' },
  { name: 'Yashavanth B N', initials: 'YB', linkedin: 'https://www.linkedin.com/in/yashavanth-bn-b42926342' },
  { name: 'Bhavish S', initials: 'BS', linkedin: 'https://www.linkedin.com/in/bhavish-s-953282320' },
  { name: 'Yashas N', initials: 'YN', linkedin: 'https://www.linkedin.com/in/yashas-n-b71625310' },
];

// Generate particle positions deterministically
const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 17 + 7) % 100}%`,
  size: 2 + (i % 4),
  delay: (i * 0.7) % 8,
  duration: 6 + (i % 5) * 2,
  color: i % 3 === 0 ? 'rgba(168,85,247,0.6)' : 'rgba(0,220,255,0.5)',
}));

interface ContactUsModalProps {
  onClose: () => void;
}

const ContactUsModal: React.FC<ContactUsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      {/* ===== BACKGROUND: Deep Space ===== */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 20%, #0a1628 0%, #050a14 50%, #000000 100%)' }} />

      {/* ===== FLOATING PARTICLES ===== */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.left,
              bottom: `-${p.size + 10}px`,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
              animation: `antigravFloat ${p.duration}s ${p.delay}s linear infinite`,
            }}
          />
        ))}
      </div>

      {/* ===== MODAL ===== */}
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(8,18,38,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(0,220,255,0.2)',
          boxShadow: '0 0 40px rgba(0,200,255,0.08), 0 0 80px rgba(0,200,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)',
          animation: 'modalFloat 4s ease-in-out infinite, glowPulse 3s ease-in-out infinite',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 hover:rotate-90"
          style={{ background: 'rgba(0,220,255,0.1)', border: '1px solid rgba(0,220,255,0.2)' }}
        >
          <X className="w-4 h-4" style={{ color: 'rgba(0,220,255,0.8)' }} />
        </button>

        {/* ===== HEADER ===== */}
        <div className="text-center mb-6">
          <h2
            className="text-2xl md:text-3xl font-extrabold mb-4"
            style={{
              color: '#00dcff',
              letterSpacing: '0.15em',
              textShadow: '0 0 20px rgba(0,220,255,0.5), 0 0 40px rgba(0,220,255,0.2)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            NO DUE PORTAL
          </h2>
          <a
            href="mailto:nodue.mitm@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 group"
            style={{
              background: 'rgba(0,220,255,0.06)',
              border: '1px solid rgba(0,220,255,0.15)',
            }}
          >
            <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" style={{ color: 'rgba(0,220,255,0.7)' }} />
            <span className="text-sm font-medium" style={{ color: 'rgba(0,220,255,0.8)' }}>
              nodue.mitm@gmail.com
            </span>
          </a>
        </div>

        {/* ===== DIVIDER ===== */}
        <div className="h-px mb-6" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,220,255,0.2), transparent)' }} />

        {/* ===== DEVELOPERS SECTION ===== */}
        <div className="mb-6">
          <p
            className="text-center text-[10px] font-bold uppercase mb-5"
            style={{ color: 'rgba(0,220,255,0.4)', letterSpacing: '0.25em' }}
          >
            Developers
          </p>

          <div className="grid grid-cols-2 gap-3">
            {DEVELOPERS.map((dev, idx) => (
              <div
                key={dev.name}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group cursor-default"
                style={{
                  background: 'rgba(0,220,255,0.04)',
                  border: '1px solid rgba(0,220,255,0.08)',
                  animation: `devFloat 3.5s ease-in-out ${idx * 0.3}s infinite`,
                }}
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{
                    background: 'rgba(0,220,255,0.08)',
                    border: '1.5px solid rgba(0,220,255,0.3)',
                    color: 'rgba(0,220,255,0.9)',
                    boxShadow: '0 0 12px rgba(0,220,255,0.1)',
                  }}
                >
                  {dev.initials}
                </div>

                {/* Name + LinkedIn */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'rgba(180,220,255,0.9)' }}>
                    {dev.name}
                  </p>
                </div>

                <a
                  href={dev.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
                  style={{
                    background: 'rgba(0,220,255,0.08)',
                    border: '1px solid rgba(0,220,255,0.15)',
                    color: 'rgba(0,220,255,0.7)',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <LinkedinIcon />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* ===== DIVIDER ===== */}
        <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,220,255,0.15), transparent)' }} />

        {/* ===== FOOTER ===== */}
        <p
          className="text-center text-[10px] font-medium"
          style={{ color: 'rgba(0,220,255,0.35)', letterSpacing: '0.1em' }}
        >
          Developed by Dept. of CSE, MITM
        </p>
      </div>

      {/* ===== KEYFRAME ANIMATIONS ===== */}
      <style>{`
        @keyframes antigravFloat {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }
        @keyframes modalFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(0,200,255,0.06), 0 0 60px rgba(0,200,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05); border-color: rgba(0,220,255,0.2); }
          50% { box-shadow: 0 0 50px rgba(0,200,255,0.12), 0 0 100px rgba(0,200,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05); border-color: rgba(0,220,255,0.35); }
        }
        @keyframes devFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
};

export default ContactUsModal;
