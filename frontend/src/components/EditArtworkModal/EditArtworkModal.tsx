import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Artwork } from '@tastematcher/common';
import { useAuth } from '../../hooks/useAuth';
import './EditArtworkModal.css';
import { apiClient } from '../../utils/api';

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
  const [classification, setClassification] = useState(artwork.classification || '');
  const [department, setDepartment] = useState(artwork.department || '');
  const [country, setCountry] = useState(artwork.country || '');
  const [date, setDate] = useState(artwork.date || '');
  const [tags, setTags] = useState(artwork.tags?.join(', ') || '');
  const [error, setError] = useState('');

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Artwork>) => {
      if (!user?.domainId) throw new Error('No domain ID');
      return apiClient.updateArtwork(user.domainId, artwork.id, updates);
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
      classification: classification.trim() || undefined,
      department: department.trim() || undefined,
      country: country.trim() || undefined,
      date: date.trim() || undefined,
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
            <label htmlFor="edit-classification" className="edit-modal__label">
              Classification
            </label>
            <input
              id="edit-classification"
              type="text"
              className="edit-modal__input"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              placeholder="e.g., Painting, Sculpture, Photography"
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-department" className="edit-modal__label">
              Department
            </label>
            <input
              id="edit-department"
              type="text"
              className="edit-modal__input"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., Modern Art, Islamic Art"
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-country" className="edit-modal__label">
              Country
            </label>
            <input
              id="edit-country"
              type="text"
              className="edit-modal__input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., France, Japan, USA"
            />
          </div>

          <div className="edit-modal__field">
            <label htmlFor="edit-date" className="edit-modal__label">
              Date
            </label>
            <input
              id="edit-date"
              type="text"
              className="edit-modal__input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g., 1889, ca. 1500-1600"
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
