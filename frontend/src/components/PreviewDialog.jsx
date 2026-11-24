import { useEffect, useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { api } from '../api/client';
import Modal from './Modal';
import { getError } from './ui';

export default function PreviewDialog({ document, onClose, notify }) {
  const [url, setUrl] = useState(''); const [text, setText] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    let objectUrl;
    api.get(`/api/documents/${document.id}/preview`, { responseType: 'blob' })
      .then(async (response) => {
        objectUrl = URL.createObjectURL(response.data);
        if (document.mimeType === 'text/plain') setText(await response.data.text());
        else setUrl(objectUrl);
      })
      .catch((requestError) => {
        const message = requestError.response?.status === 403 ? 'You do not currently have permission to read this document.' : getError(requestError, 'Could not load document preview.');
        setError(message); notify(message, 'error');
      })
      .finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id, document.mimeType]);
  return <Modal title={document.title} eyebrow={`${document.department} · ${document.classification}`} onClose={onClose}>
    <div className="preview-content">{loading ? <div className="preview-loading"><LoaderCircle className="spinner-icon" size={20} />Loading preview securely…</div> : error ? <div className="preview-error"><FileText size={20} /><p>{error}</p></div> : document.mimeType === 'text/plain' ? <pre className="text-preview">{text}</pre> : <iframe className="pdf-preview" src={url} title={`Preview: ${document.title}`} />}</div>
    <div className="preview-footer"><span>Read access checked by TrustVault · This preview is not cached by the API</span><button className="button button-quiet" onClick={onClose}>Close</button></div>
  </Modal>;
}
