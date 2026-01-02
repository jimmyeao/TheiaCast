import { useEffect, useState, useMemo } from 'react';
import { useContentStore } from '../store/contentStore';
import { usePlaylistStore } from '../store/playlistStore';
import { contentService } from '../services/content.service';
import { ContentPreview } from '../components/ContentPreview';
import { ContentCardPreview } from '../components/ContentCardPreview';
import {
  VideoCameraIcon,
  PresentationChartBarIcon,
  PhotoIcon,
  GlobeAltIcon,
  ListBulletIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
  EyeIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

type ContentType = 'all' | 'video' | 'image' | 'presentation' | 'web';
type ViewMode = 'grid' | 'list';

export const ContentPage = () => {
  const { content, fetchContent, createContent, updateContent, deleteContent, uploadPptx, uploadVideo, uploadImage, rebuildThumbnails, isLoading } = useContentStore();
  const { playlists, fetchPlaylists } = usePlaylistStore();
  
  // UI State
  const [activeTab, setActiveTab] = useState<ContentType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('contentViewMode');
    return (saved === 'grid' || saved === 'list') ? saved : 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [showPptxModal, setShowPptxModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editingContent, setEditingContent] = useState<number | null>(null);
  
  // Storage State
  const [storageStats, setStorageStats] = useState<{
    totalSpace: number;
    freeSpace: number;
    usedSpace: number;
    contentUsed: number;
    videoSize: number;
    imageSize: number;
    slideshowSize: number;
    percentUsed: number;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    requiresInteraction: false,
  });
  const [pptxData, setPptxData] = useState({
    name: '',
    file: null as File | null,
    durationPerSlide: 10000,
  });
  const [videoData, setVideoData] = useState({
    name: '',
    file: null as File | null,
  });
  const [imageData, setImageData] = useState({
    name: '',
    file: null as File | null,
  });

  useEffect(() => {
    fetchContent();
    fetchPlaylists();
    fetchStorageStats();
  }, [fetchContent, fetchPlaylists]);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('contentViewMode', viewMode);
  }, [viewMode]);

  const fetchStorageStats = async () => {
    try {
      const stats = await contentService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Failed to fetch storage stats:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper to determine content type
  const getContentType = (url: string): 'video' | 'image' | 'presentation' | 'web' => {
    if (!url) return 'web';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/api/render/slideshow/')) return 'presentation';
    if (lowerUrl.match(/\.(mp4|webm|mkv|mov|avi)(\?|$)/)) return 'video';
    if (lowerUrl.includes('/videos/') && lowerUrl.endsWith('/index.html')) return 'video';
    if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/)) return 'image';
    if (lowerUrl.includes('/images/') && lowerUrl.endsWith('/index.html')) return 'image';
    return 'web';
  };

  // Helper to get playlists for a content item
  const getContentPlaylists = (contentId: number) => {
    return playlists.filter(p => p.items?.some(i => i.contentId === contentId));
  };

  // Filter and Sort Content
  const filteredContent = useMemo(() => {
    let result = content;

    // Filter by Tab
    if (activeTab !== 'all') {
      result = result.filter(item => getContentType(item.url) === activeTab);
    }

    // Filter by Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.url.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query))
      );
    }

    // Sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof typeof a];
        let bValue: any = b[sortConfig.key as keyof typeof b];

        // Handle special sort keys
        if (sortConfig.key === 'playlists') {
          aValue = getContentPlaylists(a.id).length;
          bValue = getContentPlaylists(b.id).length;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [content, activeTab, searchQuery, sortConfig, playlists]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return current.direction === 'asc' 
          ? { key, direction: 'desc' } 
          : null;
      }
      return { key, direction: 'asc' };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingContent) {
        await updateContent(editingContent, formData);
        setShowModal(false);
        setEditingContent(null);
        setFormData({ name: '', url: '', description: '', requiresInteraction: false });
        fetchContent();
      } else {
        await createContent(formData);
        setShowModal(false);
        setFormData({ name: '', url: '', description: '', requiresInteraction: false });
        fetchContent();
      }
    } catch (error) {
      // Error handled by store
    }
  };

  const handlePptxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pptxData.file) return;

    try {
      await uploadPptx(pptxData.file, pptxData.name, pptxData.durationPerSlide);
      setShowPptxModal(false);
      setPptxData({ name: '', file: null, durationPerSlide: 10000 });
      await fetchStorageStats(); // Refresh storage stats
    } catch (error) {
      // Error handled by store
    }
  };

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoData.file) return;

    try {
      await uploadVideo(videoData.file, videoData.name);
      setShowVideoModal(false);
      setVideoData({ name: '', file: null });
      await fetchStorageStats(); // Refresh storage stats
    } catch (error) {
      // Error handled by store
    }
  };

  const handleImageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageData.file) return;

    try {
      await uploadImage(imageData.file, imageData.name);
      setShowImageModal(false);
      setImageData({ name: '', file: null });
      await fetchStorageStats(); // Refresh storage stats
    } catch (error) {
      // Error handled by store
    }
  };

  const handleEdit = (item: any) => {
    setFormData({
      name: item.name,
      url: item.url,
      description: item.description || '',
      requiresInteraction: item.requiresInteraction || false,
    });
    setEditingContent(item.id);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this content?')) {
      await deleteContent(id);
      await fetchStorageStats(); // Refresh storage stats
    }
  };

  const handleRebuildThumbnails = async () => {
    if (confirm('This will rebuild all thumbnails for all content items. This may take several minutes. Continue?')) {
      try {
        const result = await rebuildThumbnails();
        alert(`Thumbnail rebuild complete!\n\nTotal: ${result.total}\nSucceeded: ${result.rebuilt}\nFailed: ${result.failed}`);
        await fetchContent();
      } catch (error) {
        alert('Failed to rebuild thumbnails. Check the console for details.');
      }
    }
  };

  const handlePreview = () => {
    if (formData.url) {
      setPreviewUrl(formData.url);
      setShowPreview(true);
    }
  };

  const handleAddFromPreview = async (url: string, name: string) => {
    try {
      await createContent({ name, url, description: '', requiresInteraction: false });
      setShowPreview(false);
      setPreviewUrl('');
      fetchContent();
    } catch (error) {
      // Error handled by store
    }
  };

  const renderTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <VideoCameraIcon className="w-5 h-5 text-purple-500" />;
      case 'image': return <PhotoIcon className="w-5 h-5 text-green-500" />;
      case 'presentation': return <PresentationChartBarIcon className="w-5 h-5 text-orange-500" />;
      default: return <GlobeAltIcon className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Content Library</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">Manage your digital signage assets</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              setVideoData({ name: '', file: null });
              setShowVideoModal(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] flex-1 md:flex-initial justify-center"
          >
            <VideoCameraIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Upload Video</span>
            <span className="sm:hidden">Video</span>
          </button>
          <button
            onClick={() => {
              setImageData({ name: '', file: null });
              setShowImageModal(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] flex-1 md:flex-initial justify-center"
          >
            <PhotoIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Upload Image</span>
            <span className="sm:hidden">Image</span>
          </button>
          <button
            onClick={() => {
              setPptxData({ name: '', file: null, durationPerSlide: 10000 });
              setShowPptxModal(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] flex-1 md:flex-initial justify-center"
          >
            <PresentationChartBarIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Upload PPTX</span>
            <span className="sm:hidden">PPTX</span>
          </button>
          <button
            onClick={() => {
              setEditingContent(null);
              setFormData({ name: '', url: '', description: '', requiresInteraction: false });
              setShowModal(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] flex-1 md:flex-initial justify-center"
          >
            <GlobeAltIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Add URL</span>
            <span className="sm:hidden">URL</span>
          </button>
          <button
            onClick={handleRebuildThumbnails}
            disabled={isLoading}
            className="btn-secondary flex items-center gap-2 min-h-[44px] w-full md:w-auto justify-center"
            title="Rebuild all thumbnails"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Rebuild Thumbnails</span>
            <span className="sm:hidden">Rebuild</span>
          </button>
        </div>
      </div>

      {/* Storage Statistics */}
      {storageStats && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Disk Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disk Storage</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(storageStats.usedSpace)} / {formatBytes(storageStats.totalSpace)} ({storageStats.percentUsed.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${storageStats.percentUsed}%` }}
                  title={`Used: ${formatBytes(storageStats.usedSpace)} / Free: ${formatBytes(storageStats.freeSpace)}`}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span>Used: {formatBytes(storageStats.usedSpace)}</span>
                <span>Free: {formatBytes(storageStats.freeSpace)}</span>
              </div>
            </div>

            {/* Content Breakdown */}
            {storageStats.contentUsed > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Content Breakdown</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatBytes(storageStats.contentUsed)} total
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div className="flex h-full">
                    {storageStats.videoSize > 0 && (
                      <div
                        className="bg-purple-500 transition-all"
                        style={{ width: `${(storageStats.videoSize / storageStats.contentUsed) * 100}%` }}
                        title={`Videos: ${formatBytes(storageStats.videoSize)}`}
                      />
                    )}
                    {storageStats.imageSize > 0 && (
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${(storageStats.imageSize / storageStats.contentUsed) * 100}%` }}
                        title={`Images: ${formatBytes(storageStats.imageSize)}`}
                      />
                    )}
                    {storageStats.slideshowSize > 0 && (
                      <div
                        className="bg-orange-500 transition-all"
                        style={{ width: `${(storageStats.slideshowSize / storageStats.contentUsed) * 100}%` }}
                        title={`Presentations: ${formatBytes(storageStats.slideshowSize)}`}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
                  {storageStats.videoSize > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-purple-500 rounded"></div>
                      <span>Videos: {formatBytes(storageStats.videoSize)}</span>
                    </div>
                  )}
                  {storageStats.imageSize > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span>Images: {formatBytes(storageStats.imageSize)}</span>
                    </div>
                  )}
                  {storageStats.slideshowSize > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-orange-500 rounded"></div>
                      <span>Presentations: {formatBytes(storageStats.slideshowSize)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['all', 'video', 'image', 'presentation', 'web'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Search and View Toggle */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              <Squares2X2Icon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              <ListBulletIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading content...</p>
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No content found matching your filters.</p>
          <button onClick={() => { setActiveTab('all'); setSearchQuery(''); }} className="text-blue-600 hover:underline">
            Clear filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredContent.map((item) => {
            const type = getContentType(item.url);
            const itemPlaylists = getContentPlaylists(item.id);
            
            return (
              <div key={item.id} className="card group hover:shadow-lg transition-shadow duration-200">
                {/* Preview */}
                <div className="mb-3">
                  <ContentCardPreview url={item.url} name={item.name} type={type} />
                </div>

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {renderTypeIcon(type)}
                    <span className="text-xs font-medium text-gray-500 uppercase">{type}</span>
                  </div>
                  {item.requiresInteraction && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                      Interactive
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-1" title={item.name}>
                  {item.name}
                </h3>

                <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2 mb-3 text-xs font-mono text-gray-500 break-all h-12 overflow-hidden">
                  {item.url}
                </div>

                {item.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2 h-10">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    Used in {itemPlaylists.length} playlist{itemPlaylists.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex gap-2 pt-3 border-t dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(item)}
                    className="btn-secondary text-xs flex-1 py-1.5"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="btn-danger text-xs flex-1 py-1.5"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // List View
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('name')}
                >
                  Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  URL
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('playlists')}
                >
                  Playlists {sortConfig?.key === 'playlists' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredContent.map((item) => {
                const type = getContentType(item.url);
                const itemPlaylists = getContentPlaylists(item.id);
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                          {renderTypeIcon(type)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${type === 'video' ? 'bg-purple-100 text-purple-800' :
                          type === 'image' ? 'bg-green-100 text-green-800' :
                          type === 'presentation' ? 'bg-orange-100 text-orange-800' :
                          'bg-blue-100 text-blue-800'}`}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                        {item.url}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {itemPlaylists.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {itemPlaylists.slice(0, 2).map(p => (
                            <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                              {p.name}
                            </span>
                          ))}
                          {itemPlaylists.length > 2 && (
                            <span className="text-xs text-gray-500">+{itemPlaylists.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unused</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 mr-4">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Content Modal */}
      {showModal && (() => {
        // Check if this is uploaded content (video/image/presentation) vs manual URL
        const isUploadedContent = editingContent && formData.url && (
          formData.url.startsWith('/videos/') ||
          formData.url.startsWith('/images/') ||
          formData.url.startsWith('/api/render/slideshow/')
        );

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {editingContent ? 'Edit Content' : 'Add New Content'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    placeholder="e.g., Company Website"
                    required
                  />
                </div>

                {/* Only show URL field for manual URL content, hide for uploaded files */}
                {!isUploadedContent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={formData.url}
                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                        className="input flex-1"
                        placeholder="https://example.com"
                        required
                      />
                      <button
                        type="button"
                        onClick={handlePreview}
                        disabled={!formData.url}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title="Preview URL"
                      >
                        <EyeIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Preview</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Optional description"
                  />
                </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingContent(null);
                    setFormData({ name: '', url: '', description: '', requiresInteraction: false });
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {editingContent ? 'Update Content' : 'Add Content'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}
      {/* PPTX Upload Modal */}
      {showPptxModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Upload PowerPoint
            </h2>
            <form onSubmit={handlePptxSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={pptxData.name}
                  onChange={(e) => setPptxData({ ...pptxData, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Monthly Report"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  PowerPoint File (.pptx)
                </label>
                <input
                  type="file"
                  accept=".pptx"
                  onChange={(e) => setPptxData({ ...pptxData, file: e.target.files ? e.target.files[0] : null })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Slide Duration (seconds)
                </label>
                <input
                  type="number"
                  value={pptxData.durationPerSlide / 1000}
                  onChange={(e) => setPptxData({ ...pptxData, durationPerSlide: Number(e.target.value) * 1000 })}
                  className="input"
                  min="1"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Time to show each slide in seconds</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPptxModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
                  {isLoading ? 'Uploading...' : 'Upload & Convert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Video Upload Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Upload Video
            </h2>
            <form onSubmit={handleVideoSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={videoData.name}
                  onChange={(e) => setVideoData({ ...videoData, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Promo Video"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Video File (.mp4, .webm)
                </label>
                <input
                  type="file"
                  accept=".mp4,.webm,.mkv,.mov"
                  onChange={(e) => setVideoData({ ...videoData, file: e.target.files ? e.target.files[0] : null })}
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowVideoModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
                  {isLoading ? 'Uploading...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Image Upload Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Upload Image
            </h2>
            <form onSubmit={handleImageSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={imageData.name}
                  onChange={(e) => setImageData({ ...imageData, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Company Logo"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Image File (.jpg, .png, .gif, .webp, .svg, .bmp)
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp"
                  onChange={(e) => setImageData({ ...imageData, file: e.target.files ? e.target.files[0] : null })}
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImageModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
                  {isLoading ? 'Uploading...' : 'Upload & Display'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content Preview Modal */}
      {showPreview && (
        <ContentPreview
          url={previewUrl || 'https://example.com'}
          onClose={() => {
            setShowPreview(false);
            setPreviewUrl('');
          }}
          onAddToLibrary={handleAddFromPreview}
        />
      )}
    </div>
  );
};
