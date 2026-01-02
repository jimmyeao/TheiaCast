import { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { tagService } from '../services/tag.service';
import { playlistTagService } from '../services/playlistTag.service';
import type { Tag } from '@theiacast/shared';

interface PlaylistTagSelectorProps {
  playlistId: number;
  playlistTags: Tag[];
  onTagsChanged: () => void;
}

export const PlaylistTagSelector = ({ playlistId, playlistTags, onTagsChanged }: PlaylistTagSelectorProps) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);
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
      await playlistTagService.assignToPlaylist(playlistId, tagId);
      onTagsChanged();
      setIsOpen(false);
    } catch (error: any) {
      console.error('Failed to assign tag:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to assign tag';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    setLoading(true);
    try {
      await playlistTagService.removeFromPlaylist(playlistId, tagId);
      onTagsChanged();
    } catch (error) {
      console.error('Failed to remove tag:', error);
      alert('Failed to remove tag');
    } finally {
      setLoading(false);
    }
  };

  const availableTags = allTags.filter(
    (tag) => !playlistTags.some((pt) => pt.id === tag.id)
  );

  return (
    <div className="relative">
      {/* Tag Badges */}
      <div className="flex flex-wrap gap-2 mb-2">
        {playlistTags.map((tag) => (
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
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 px-3 py-1 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-md"
        >
          <PlusIcon className="w-4 h-4" />
          Assign Tag
        </button>

        {/* Dropdown */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            {/* Menu */}
            <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-20">
              {availableTags.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No tags available
                </div>
              ) : (
                <div className="py-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleAssignTag(tag.id)}
                      disabled={loading}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-gray-900 dark:text-white">{tag.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
