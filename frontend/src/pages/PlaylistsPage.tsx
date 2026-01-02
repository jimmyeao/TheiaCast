import { useEffect, useState } from 'react';
import { usePlaylistStore } from '../store/playlistStore';
import { useContentStore } from '../store/contentStore';
import type { Playlist, CreatePlaylistItemDto } from '@theiacast/shared';
import { PlaylistTagSelector } from '../components/PlaylistTagSelector';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable item component for drag-and-drop
const SortablePlaylistItem = ({
  item,
  playlist,
  daysOfWeekOptions,
  onEdit,
  onDelete,
}: {
  item: any;
  playlist: Playlist;
  daysOfWeekOptions: { value: number; label: string }[];
  onEdit: (item: any, playlist: Playlist) => void;
  onDelete: (itemId: number) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 self-start sm:self-auto"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>

      <div className="flex-1 w-full sm:w-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
          <span className="inline-flex items-center justify-center w-8 h-8 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            {item.orderIndex + 1}
          </span>
          <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">
            {item.content?.name || `Content ID: ${item.contentId}`}
          </span>
          <span className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0">
            {item.displayDuration === 0 ? 'Permanent' : `${item.displayDuration / 1000}s`}
          </span>
        </div>
        {(item.timeWindowStart || item.daysOfWeek) && (
          <div className="text-sm text-gray-600 dark:text-gray-400 ml-11 mt-1 space-x-4">
            {item.timeWindowStart && (
              <span className="inline-flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {item.timeWindowStart} - {item.timeWindowEnd || 'End of day'}
              </span>
            )}
            {item.daysOfWeek && (
              <span className="inline-flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {(JSON.parse(item.daysOfWeek) as number[])
                  .map((d: number) => daysOfWeekOptions[d].label)
                  .join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 w-full sm:w-auto">
        <button onClick={() => onEdit(item, playlist)} className="btn-secondary text-sm flex-1 sm:flex-initial min-h-[36px]">
          Edit
        </button>
        <button onClick={() => onDelete(item.id)} className="btn-danger text-sm flex-1 sm:flex-initial min-h-[36px]">
          Remove
        </button>
      </div>
    </div>
  );
};

export const PlaylistsPage = () => {
  const {
    playlists,
    fetchPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    createPlaylistItem,
    updatePlaylistItem,
    deletePlaylistItem,
    isLoading,
  } = usePlaylistStore();

  const { content, fetchContent } = useContentStore();

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<number | null>(null);
  const [editingPlaylistItem, setEditingPlaylistItem] = useState<number | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [expandedPlaylist, setExpandedPlaylist] = useState<number | null>(null);

  const [playlistFormData, setPlaylistFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });

  const [itemFormData, setItemFormData] = useState<Partial<CreatePlaylistItemDto>>({
    playlistId: 0,
    contentId: 0,
    displayDuration: 0, // 0 = play forever (no rotation)
    orderIndex: 0,
    timeWindowStart: '',
    timeWindowEnd: '',
    daysOfWeek: [],
  });

  useEffect(() => {
    fetchPlaylists();
    fetchContent();
  }, [fetchPlaylists, fetchContent]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlaylist) {
        await updatePlaylist(editingPlaylist, playlistFormData);
        setShowPlaylistModal(false);
        setEditingPlaylist(null);
        setPlaylistFormData({ name: '', description: '', isActive: true });
        fetchPlaylists();
      } else {
        await createPlaylist(playlistFormData);
        setShowPlaylistModal(false);
        setPlaylistFormData({ name: '', description: '', isActive: true });
        fetchPlaylists();
      }
    } catch (error) {
      // Error handled by store
    }
  };

  const handleEditPlaylist = (playlist: Playlist) => {
    setPlaylistFormData({
      name: playlist.name,
      description: playlist.description || '',
      isActive: playlist.isActive,
    });
    setEditingPlaylist(playlist.id);
    setShowPlaylistModal(true);
  };

  const handleDeletePlaylist = async (id: number) => {
    if (confirm('Are you sure you want to delete this playlist? All items will be removed.')) {
      await deletePlaylist(id);
    }
  };

  const handleOpenItemModal = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setItemFormData({
      ...itemFormData,
      playlistId: playlist.id,
      orderIndex: playlist.items?.length || 0,
    });
    setShowItemModal(true);
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Clean up empty optional fields
      const cleanedData: any = {
        playlistId: itemFormData.playlistId!,
        contentId: itemFormData.contentId!,
        displayDuration: itemFormData.displayDuration!,
        orderIndex: itemFormData.orderIndex!,
      };

      // Only add optional fields if they have values
      if (itemFormData.timeWindowStart && itemFormData.timeWindowStart.trim()) {
        cleanedData.timeWindowStart = itemFormData.timeWindowStart;
      }
      if (itemFormData.timeWindowEnd && itemFormData.timeWindowEnd.trim()) {
        cleanedData.timeWindowEnd = itemFormData.timeWindowEnd;
      }
      // Always send daysOfWeek to allow clearing the constraint (empty array = no constraint)
      cleanedData.daysOfWeek = itemFormData.daysOfWeek || [];

      if (editingPlaylistItem) {
        await updatePlaylistItem(editingPlaylistItem, cleanedData);
        setShowItemModal(false);
        setEditingPlaylistItem(null);
      } else {
        await createPlaylistItem(cleanedData);
        setShowItemModal(false);
      }

      setItemFormData({
        playlistId: 0,
        contentId: 0,
        displayDuration: 0, // 0 = play forever (no rotation)
        orderIndex: 0,
        timeWindowStart: '',
        timeWindowEnd: '',
        daysOfWeek: [],
      });
      fetchPlaylists();
    } catch (error) {
      // Error handled by store
    }
  };

  const handleEditPlaylistItem = (item: any, playlist: Playlist) => {
    console.log('=== EDIT ITEM DEBUG ===');
    console.log('Full item object:', item);
    console.log('item.displayDuration:', item.displayDuration);
    console.log('item.displayDuration type:', typeof item.displayDuration);

    setItemFormData({
      playlistId: playlist.id,
      contentId: item.contentId,
      displayDuration: item.displayDuration,
      orderIndex: item.orderIndex,
      timeWindowStart: item.timeWindowStart || '',
      timeWindowEnd: item.timeWindowEnd || '',
      daysOfWeek: item.daysOfWeek ? JSON.parse(item.daysOfWeek) : [],
    });
    setSelectedPlaylist(playlist);
    setEditingPlaylistItem(item.id);
    setShowItemModal(true);
  };

  const handleDeleteItem = async (itemId: number) => {
    if (confirm('Are you sure you want to remove this item from the playlist?')) {
      await deletePlaylistItem(itemId);
      fetchPlaylists();
    }
  };

  const togglePlaylist = (playlistId: number) => {
    setExpandedPlaylist(expandedPlaylist === playlistId ? null : playlistId);
  };

  const daysOfWeekOptions = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];

  const handleDayToggle = (day: number) => {
    const currentDays = itemFormData.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();
    setItemFormData({ ...itemFormData, daysOfWeek: newDays });
  };

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event
  const handleDragEnd = async (event: DragEndEvent, playlist: Playlist) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const items = playlist.items || [];
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Reorder items locally
    const reorderedItems = arrayMove(items, oldIndex, newIndex);

    // Update orderIndex for all affected items
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      orderIndex: index,
    }));

    // Update each item's orderIndex via API
    try {
      for (const update of updates) {
        await updatePlaylistItem(update.id, { orderIndex: update.orderIndex });
      }
      // Refresh playlists to show updated order
      await fetchPlaylists();
    } catch (error) {
      console.error('Failed to reorder playlist items:', error);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Content Playlists</h1>
        <button
          onClick={() => {
            setEditingPlaylist(null);
            setPlaylistFormData({ name: '', description: '', isActive: true });
            setShowPlaylistModal(true);
          }}
          className="btn-primary min-h-[44px] w-full sm:w-auto"
        >
          + Create Playlist
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading playlists...</p>
        </div>
      ) : playlists.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600 mb-4">No playlists created yet.</p>
          <button onClick={() => setShowPlaylistModal(true)} className="btn-primary">
            Create Your First Playlist
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="card hover:shadow-lg transition-shadow duration-200">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-4">
                <div className="flex-1 w-full sm:w-auto min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{playlist.name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        playlist.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {playlist.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  {playlist.description && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{playlist.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {playlist.items?.length || 0} item{playlist.items?.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {playlist.devicePlaylists?.length || 0} device{playlist.devicePlaylists?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <PlaylistTagSelector
                    playlistId={playlist.id}
                    playlistTags={playlist.tags || []}
                    onTagsChanged={fetchPlaylists}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingPlaylistItem(null);
                      handleOpenItemModal(playlist);
                    }}
                    className="btn-secondary text-sm"
                    title="Add content item to playlist"
                  >
                    + Add Item
                  </button>
                  <button
                    onClick={() => togglePlaylist(playlist.id)}
                    className="btn-secondary text-sm"
                    title={expandedPlaylist === playlist.id ? 'Hide items' : 'View items'}
                  >
                    {expandedPlaylist === playlist.id ? '▲ Hide' : '▼ View'}
                  </button>
                  <button
                    onClick={() => handleEditPlaylist(playlist)}
                    className="btn-secondary text-sm"
                    title="Edit playlist"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeletePlaylist(playlist.id)}
                    className="btn-danger text-sm"
                    title="Delete playlist"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {expandedPlaylist === playlist.id && playlist.items && playlist.items.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4">
                    Playlist Items (Drag to reorder):
                  </h4>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleDragEnd(event, playlist)}
                  >
                    <SortableContext
                      items={playlist.items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {playlist.items
                          .sort((a, b) => a.orderIndex - b.orderIndex)
                          .map((item) => (
                            <SortablePlaylistItem
                              key={item.id}
                              item={item}
                              playlist={playlist}
                              daysOfWeekOptions={daysOfWeekOptions}
                              onEdit={handleEditPlaylistItem}
                              onDelete={handleDeleteItem}
                            />
                          ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Playlist Modal */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              {editingPlaylist ? 'Edit Playlist' : 'Create New Playlist'}
            </h2>
            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Playlist Name
                </label>
                <input
                  type="text"
                  value={playlistFormData.name}
                  onChange={(e) =>
                    setPlaylistFormData({ ...playlistFormData, name: e.target.value })
                  }
                  className="input"
                  placeholder="e.g., Main Lobby Rotation"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={playlistFormData.description}
                  onChange={(e) =>
                    setPlaylistFormData({ ...playlistFormData, description: e.target.value })
                  }
                  className="input"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={playlistFormData.isActive}
                  onChange={(e) =>
                    setPlaylistFormData({ ...playlistFormData, isActive: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                  Active
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlaylistModal(false);
                    setEditingPlaylist(null);
                    setPlaylistFormData({ name: '', description: '', isActive: true });
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {editingPlaylistItem ? 'Edit Playlist Item' : 'Add Item to Playlist'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {selectedPlaylist?.name}
            </p>
            <form onSubmit={handleCreateItem} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <select
                  value={itemFormData.contentId}
                  onChange={(e) => {
                    const contentId = parseInt(e.target.value);
                    const selectedContent = content.find(c => c.id === contentId);
                    setItemFormData({
                      ...itemFormData,
                      contentId,
                      // If content has a default duration, use it!
                      displayDuration: selectedContent?.defaultDuration ? selectedContent.defaultDuration * 1000 : itemFormData.displayDuration
                    });
                  }}
                  className="input"
                  required
                >
                  <option value="">Select content...</option>
                  {content.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.defaultDuration ? `(${c.defaultDuration}s)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Display Duration (seconds)
                </label>
                <input
                  type="number"
                  value={(() => {
                    const val = itemFormData.displayDuration !== undefined ? itemFormData.displayDuration / 1000 : 0;
                    console.log('Duration input value calculation:', {
                      displayDuration: itemFormData.displayDuration,
                      calculated: val
                    });
                    return val;
                  })()}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, displayDuration: Number(e.target.value) * 1000 })
                  }
                  className="input"
                  min="0"
                  step="1"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  How long to display this content in seconds (0 = play forever, no rotation)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order Index
                </label>
                <input
                  type="number"
                  value={itemFormData.orderIndex}
                  onChange={(e) =>
                    setItemFormData({ ...itemFormData, orderIndex: Number(e.target.value) })
                  }
                  className="input"
                  min="0"
                  required
                />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Time Restrictions (Optional)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Leave blank to show at any time
                </p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={itemFormData.timeWindowStart || ''}
                      onChange={(e) =>
                        setItemFormData({ ...itemFormData, timeWindowStart: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={itemFormData.timeWindowEnd || ''}
                      onChange={(e) =>
                        setItemFormData({ ...itemFormData, timeWindowEnd: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Specific Days
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {daysOfWeekOptions.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => handleDayToggle(day.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          (itemFormData.daysOfWeek || []).includes(day.value)
                            ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Leave unselected to show every day
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowItemModal(false);
                    setEditingPlaylistItem(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {editingPlaylistItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
