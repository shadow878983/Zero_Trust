import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, eyebrow, onClose, children }) {
  useEffect(() => {
    const handleKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><span className="eyebrow page-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}
