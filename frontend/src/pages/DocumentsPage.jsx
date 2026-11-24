import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Building2, Eye, FileText, Filter, Plus, RefreshCw, Search, Share2 } from 'lucide-react';
import { api } from '../api/client';
import { EmptyState, getError, PageHeading, Spinner } from '../components/ui';
import UploadDialog from '../components/UploadDialog';
import ShareDialog from '../components/ShareDialog';
import PreviewDialog from '../components/PreviewDialog';

const classes = ['Public', 'Internal', 'Confidential', 'Restricted'];

export default function DocumentsPage({ user, notify }) {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [classification, setClassification] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareDocument, setShareDocument] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/documents');
      setDocuments(response.data.data.documents || []);
    } catch (error) {
      notify(getError(error, 'Could not load documents.'), 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadDocuments(); }, []);

  const visibleDocuments = useMemo(() => documents.filter((item) => {
    const text = `${item.title} ${item.description} ${item.department}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (classification === 'all' || item.classification === classification);
  }), [documents, query, classification]);

  const download = async (item) => {
    setBusyId(item.id);
    try {
      const response = await api.get(`/api/documents/${item.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      const extension = item.mimeType === 'application/pdf' ? 'pdf' : 'txt';
      anchor.href = url;
      anchor.download = `${item.title.replace(/[^\w.-]+/g, '_')}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify('Authorized download started.');
    } catch (error) {
      const status = error?.response?.status;
      notify(status === 403 ? 'Access denied. Current policy or grants do not allow this download.' : 'Could not download this document.', 'error');
    } finally { setBusyId(''); }
  };

  return <>
    <PageHeading eyebrow="DOCUMENT EXCHANGE" title="Documents" description="Only documents allowed by your current role, attributes, and grants appear here." action={user.role === 'Admin' && <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={17} /> Upload document</button>} />
    <div className="toolbar panel"><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents or departments…" /></label><label className="filter-select"><Filter size={15} /><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="all">All classifications</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label><span className="results-count">{visibleDocuments.length} documents</span></div>
    <section className="panel table-panel"><div className="table-panel-heading"><div><h2>Accessible documents</h2><p>View and download requests are checked against current policy.</p></div><button className="icon-button" onClick={loadDocuments} title="Refresh"><RefreshCw size={16} /></button></div>
      {loading ? <Spinner label="Checking document access…" /> : visibleDocuments.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Document</th><th>Department</th><th>Classification</th><th>Added</th><th>Actions</th></tr></thead><tbody>{visibleDocuments.map((item) => <tr key={item.id}><td><div className="document-cell"><span className="file-type-icon"><FileText size={17} /></span><span><strong>{item.title}</strong><small>{item.description || item.mimeType}</small></span></div></td><td><span className="department-cell"><Building2 size={14} />{item.department}</span></td><td><span className={`classification-badge ${item.classification.toLowerCase()}`}><i />{item.classification}</span></td><td className="muted-cell">{new Date(item.createdAt).toLocaleDateString()}</td><td><div className="row-actions">{item.canPreview && <button className="icon-button row-action" onClick={() => setPreviewDocument(item)} title="Preview document" aria-label={`Preview ${item.title}`}><Eye size={16} /></button>}{item.canDownload && <button className="icon-button row-action" disabled={busyId === item.id} onClick={() => download(item)} title="Download" aria-label={`Download ${item.title}`}><ArrowDownToLine size={16} /></button>}{!item.canPreview && !item.canDownload && <span className="metadata-only-label">Details only</span>}{user.role === 'Admin' && <button className="icon-button row-action" onClick={() => setShareDocument(item)} title="Manage access"><Share2 size={16} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title={documents.length ? 'No matching documents' : 'No documents available'} message={documents.length ? 'Try another search or classification.' : 'Documents will appear when policy allows access.'} />}
    </section>
    {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); loadDocuments(); notify('Document uploaded to private storage.'); }} notify={notify} />}
    {shareDocument && <ShareDialog document={shareDocument} onClose={() => setShareDocument(null)} notify={notify} />}
    {previewDocument && <PreviewDialog document={previewDocument} onClose={() => setPreviewDocument(null)} notify={notify} />}
  </>;
}
