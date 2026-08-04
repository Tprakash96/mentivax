import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/**
 * Upload + manage a student's document files (stored in S3 under
 * {admissionYear}/{admissionNo}/). Uses presigned URLs: the browser PUTs the
 * file straight to S3, then confirms the record with the API.
 */
export function DocumentUploader({ studentId }: { studentId: string }) {
  const { api, can } = useApi();
  const toast = useToast();
  const docs = useAsync(() => api.students.documents.list(studentId), [studentId]);
  const docTypes = useAsync(() => api.documentTypes.list(), []);
  const typeNames = (docTypes.data ?? []).map((t) => t.name);
  const [docType, setDocType] = useState('');
  useEffect(() => {
    if (!docType && typeNames[0]) setDocType(typeNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypes.data]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const configured = docs.data?.configured ?? true;
  const files = docs.data?.files ?? [];

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const { uploadUrl, s3Key } = await api.students.documents.presign(studentId, {
        docType,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await api.students.documents.confirm(studentId, {
        docType,
        fileName: file.name,
        s3Key,
        sizeBytes: file.size,
        contentType: file.type || '',
      });
      toast(`${file.name} uploaded`);
      docs.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const view = async (id: string) => {
    try {
      const { url } = await api.students.documents.url(studentId, id);
      window.open(url, '_blank', 'noopener');
    } catch {
      toast('Could not open the file');
    }
  };
  const remove = async (id: string) => {
    await api.students.documents.remove(studentId, id);
    docs.reload();
  };

  if (!configured) {
    return (
      <div className="state">
        Document uploads aren’t switched on yet. Ask your administrator to enable file storage for this school.
      </div>
    );
  }

  return (
    <div className="docup">
      {can('students:write') && (
        <div className="docup-bar">
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {typeNames.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
            <option value="Other">Other</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <button className="btn grn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="import" size={14} />
            {busy ? 'Uploading…' : `Upload ${docType}`}
          </button>
        </div>
      )}

      <div className="card-t" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>File</th>
              <th className="num">Size</th>
              <th>Uploaded</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td><b style={{ fontWeight: 600 }}>{f.docType}</b></td>
                <td style={{ color: 'var(--ink-2)' }}>{f.fileName}</td>
                <td className="num mono">{fmtSize(f.sizeBytes)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{f.uploadedAt.slice(0, 10)}</td>
                <td className="num">
                  <div className="rowacts">
                    <button className="btn sm" onClick={() => void view(f.id)}><Icon name="eye" size={13} />View</button>
                    {can('students:write') && (
                      <button className="btn sm" onClick={() => void remove(f.id)} title="Delete"><Icon name="trash" size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.loading && <div className="state">Loading…</div>}
        {!docs.loading && files.length === 0 && <div className="state">No files uploaded yet.</div>}
      </div>
    </div>
  );
}
