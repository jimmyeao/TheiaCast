import { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { tagService } from '../services/tag.service';
import type { Tag, CreateTagDto, UpdateTagDto } from '@theiacast/shared';

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTagsChanged?: () => void;
}

export const TagManagementModal = ({ isOpen, onClose, onTagsChanged }: TagManagementModalProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6'); // Default blue
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const loadTags = async () => {
    try {
      const data = await tagService.getAll();
      setTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    setLoading(true);
    try {
      const dto: CreateTagDto = {
        name: newTagName.trim(),
        color: newTagColor,
      };
      await tagService.create(dto);
      setNewTagName('');
      setNewTagColor('#3B82F6');
      setIsCreating(false);
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error('Failed to create tag:', error);
      alert('Failed to create tag');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !newTagName.trim()) return;

    setLoading(true);
    try {
      const dto: UpdateTagDto = {
        name: newTagName.trim(),
        color: newTagColor,
      };
      await tagService.update(editingTag.id, dto);
      setEditingTag(null);
      setNewTagName('');
      setNewTagColor('#3B82F6');
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error('Failed to update tag:', error);
      alert('Failed to update tag');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm('Are you sure you want to delete this tag? It will be removed from all devices.')) {
      return;
    }

    setLoading(true);
    try {
      await tagService.delete(tagId);
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error('Failed to delete tag:', error);
      alert('Failed to delete tag');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
    setIsCreating(false);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setIsCreating(false);
    setNewTagName('');
    setNewTagColor('#3B82F6');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Tags</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create/Edit Form */}
          {(isCreating || editingTag) && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {editingTag ? 'Edit Tag' : 'Create New Tag'}
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="h-10 w-20 border border-gray-300 dark:border-gray-600 rounded-md"
                  />
                </div>
                <button
                  onClick={editingTag ? handleUpdateTag : handleCreateTag}
                  disabled={loading || !newTagName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {editingTag ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Create Button */}
          {!isCreating && !editingTag && (
            <button
              onClick={() => setIsCreating(true)}
              className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              <PlusIcon className="w-5 h-5" />
              Create New Tag
            </button>
          )}

          {/* Tags List */}
          <div className="space-y-2">
            {tags.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No tags yet. Create one to get started.
              </p>
            )}
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium text-gray-900 dark:text-white">{tag.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(tag)}
                    className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-md"
                    title="Edit tag"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded-md"
                    title="Delete tag"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
