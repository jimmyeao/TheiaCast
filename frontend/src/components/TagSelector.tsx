import { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { tagService } from '../services/tag.service';
import type { Tag } from '@theiacast/shared';

interface TagSelectorProps {
  deviceId: number;
  deviceTags: Tag[];
  onTagsChanged: () => void;
}

export const TagSelector = ({ deviceId, deviceTags, onTagsChanged }: TagSelectorProps) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAllTags();
  }, []);

  const loadAllTags = async () => {
    try {
      const data = await tagService.getAll();
      setAllTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const handleAssignTag = async (tagId: number) => {
    setLoading(true);
    try {
      await tagService.assignToDevice(deviceId, tagId);
      onTagsChanged();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to assign tag:', error);
      alert('Failed to assign tag');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    setLoading(true);
    try {
      await tagService.removeFromDevice(deviceId, tagId);
      onTagsChanged();
    } catch (error) {
      console.error('Failed to remove tag:', error);
      alert('Failed to remove tag');
    } finally {
      setLoading(false);
    }
  };

  const availableTags = allTags.filter(
    (tag) => !deviceTags.some((dt) => dt.id === tag.id)
  );

  return (
    <>
    <div className="relative">
      {/* Tag Badges */}
      <div className="flex flex-wrap gap-2 mb-2">
        {deviceTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              disabled={loading}
              className="hover:bg-black hover:bg-opacity-20 rounded-full p-0.5"
              title="Remove tag"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </span>
        ))}
      </div>

      {/* Add Tag Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-md min-h-[36px]"
      >
        <PlusIcon className="w-4 h-4" />
        Add Tag
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Add Tag
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Tags List */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {availableTags.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tags available to add
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleAssignTag(tag.id)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px]"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">
                        {tag.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn-secondary min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
