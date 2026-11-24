import { Files } from 'lucide-react';

export function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow page-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}
export function EmptyState({ icon: Icon = Files, title, message }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={20} /></div><strong>{title}</strong><p>{message}</p></div>;
}
export function Spinner({ label = 'Loading…' }) { return <div className="loading-state"><span className="spinner" />{label}</div>; }
export function StatusBadge({ children, tone = 'neutral' }) { return <span className={`status-badge ${tone}`}>{children}</span>; }
export function dateLabel(value) {
  if (!value) return '—'; const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
export function getError(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  return data && !(data instanceof Blob) && data.message ? data.message : fallback;
}
