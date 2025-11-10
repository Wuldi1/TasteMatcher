import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { useAuth } from '../../hooks/useAuth';
import { updateArtwork } from '../../services/artworksApi';
import './EditArtworkModal.css';

interface EditArtworkModalProps {
  artwork: Artwork;
  onClose: () => void;
  onSave: () => void;
}

export function EditArtworkModal({ artwork, onClose, onSave }: EditArtworkModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(artwork.title || '');
  const [artist, setArtist] = useState(artwork.artist || '');
  const [description, setDescription] = useState(artwork.description || '');
  const [tags, setTags] = useState(artwork.tags?.join(', ') || '');
  const [error, setError] = useState('');

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Artwork>) => {
      if (!user?.domainId) throw new Error('No domain ID');
      return updateArtwork(user.domainId, artwork.id, updates);
    },
    onSuccess: () => {
      onSave();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update artwork');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const updates: Partial<Artwork> = {
      title: title.trim() || undefined,
      artist: artist.trim() || undefined,
      description: description.trim() || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };

    updateMutation.mutate(updates);
  };

  return (
    <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
      <div className="edit-modal__content">
        <div className="edit-modal__header">
          <h2 id="edit-modal-title" className="edit-modal__title">Edit Artwork</h2>
          <button
            type="button"
            className="edit-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <form className="edit-modal__form" onSubmit={handleSubmit}>
          {error && (
            <div className="edit-modal__error" role="alert">
              {error}
            </div>
          )}

          <div className="edit-modal__field">
            <label htmlFor="edit-title" className="edit-modal__label">
              Title
            </label>
            <input
              id="edit-title"
              type="text"
              className="edit-modal__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-artist" className="edit-modal__label">
              Artist
            </label>
            <input
              id="edit-artist"
              type="text"
              className="edit-modal__input"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-description" className="edit-modal__label">
              Description
            </label>
            <textarea
              id="edit-description"
              className="edit-modal__textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-tags" className="edit-modal__label">
              Tags (comma-separated)
            </label>
            <input
              id="edit-tags"
              type="text"
              className="edit-modal__input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="landscape, nature, sunset"
            />
          </div>

          <div className="edit-modal__actions">
            <button
              type="button"
              className="edit-modal__button edit-modal__button--cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="edit-modal__button edit-modal__button--save"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
