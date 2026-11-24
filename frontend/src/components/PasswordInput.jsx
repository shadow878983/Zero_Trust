import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ value, onChange, placeholder, autoComplete, minLength, maxLength, required = true }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input-wrap"><input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} required={required} /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
}
