import { useState } from 'react';
import { Send, Lock } from 'lucide-react';
import { type Note } from '../store/leadStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

interface NoteThreadProps {
  leadId: string;
  notes: Note[];
}

const noteTypeIcons: Record<string, string> = {
  CALL_NOTE: '📞',
  WHATSAPP_NOTE: '💬',
  VISIT_NOTE: '🏥',
  INTERNAL: '📝',
  FOLLOW_UP: '📅',
  GENERAL: '💭',
};

export default function NoteThread({ leadId, notes: initialNotes }: NoteThreadProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('GENERAL');
  const [isAdminOnly, setIsAdminOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await api.post('/notes', {
        leadId,
        content: newNote.trim(),
        type: noteType,
        isAdminOnly: isAdmin ? isAdminOnly : false,
      });

      setNotes([response.data.note, ...notes]);
      setNewNote('');
      setIsAdminOnly(false);
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Notes ({notes.length})
      </h4>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          >
            <option value="GENERAL">💭 General</option>
            <option value="CALL_NOTE">📞 Call</option>
            <option value="WHATSAPP_NOTE">💬 WhatsApp</option>
            <option value="VISIT_NOTE">🏥 Visit</option>
            <option value="FOLLOW_UP">📅 Follow-up</option>
            <option value="INTERNAL">📝 Internal</option>
          </select>

          <div className="relative flex-1">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
            />
            <button
              type="submit"
              disabled={!newNote.trim() || isSubmitting}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-dental-500 hover:bg-dental-50 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Admin-only toggle */}
        {isAdmin && (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={isAdminOnly}
              onChange={(e) => setIsAdminOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-dental-500 focus:ring-dental-500"
            />
            <Lock className="h-3.5 w-3.5" />
            Admin only (hidden from clinic staff)
          </label>
        )}
      </form>

      {/* Notes list */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No notes yet. Add one above.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={clsx(
                'rounded-lg border p-3',
                note.isAdminOnly 
                  ? 'border-amber-200 bg-amber-50' 
                  : 'border-slate-100 bg-slate-50'
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{noteTypeIcons[note.type] || '💭'}</span>
                  <span className="text-sm font-medium text-slate-900">
                    {note.author.name}
                  </span>
                  {note.author.role && (
                    <span className="text-xs text-slate-400">
                      {note.author.role.replace('_', ' ')}
                    </span>
                  )}
                  {note.isAdminOnly && (
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      <Lock className="h-3 w-3" />
                      Admin only
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {format(parseISO(note.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="text-sm text-slate-600">{note.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
