import { useEffect, useState } from 'react';
import { useDeviceStore } from '../store/deviceStore';
import { useWebSocketStore } from '../store/websocketStore';
import { usePlaylistStore } from '../store/playlistStore';
import { playlistService } from '../services/playlist.service';
import { deviceService } from '../services/device.service';
import { ScreenshotViewer } from '../components/ScreenshotViewer';
import { screenshotService } from '../services/screenshot.service';
import { websocketService } from '../services/websocket.service';
import { LiveRemoteControl } from '../components/LiveRemoteControl';
import { PlaybackControlsInline } from '../components/PlaybackControlsInline';
import { TagManagementModal } from '../components/TagManagementModal';
import { TagSelector } from '../components/TagSelector';
import { tagService } from '../services/tag.service';
import type { Playlist, Tag } from '@theiacast/shared';

export const DevicesPage = () => {
  const { devices, fetchDevices, createDevice, updateDevice, deleteDevice, isLoading } = useDeviceStore();
  const { getDeviceToken } = useDeviceStore();
  const { connectedDevices, devicePlaybackState } = useWebSocketStore();
  const { playlists, fetchPlaylists, assignPlaylistToDevice, unassignPlaylistFromDevice } = usePlaylistStore();
  const [showModal, setShowModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showDisplayConfigModal, setShowDisplayConfigModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<number | null>(null);
  const [selectedDeviceForPlaylist, setSelectedDeviceForPlaylist] = useState<number | null>(null);
  const [configuringDevice, setConfiguringDevice] = useState<any | null>(null);
  const [devicePlaylists, setDevicePlaylists] = useState<Map<number, Playlist[]>>(new Map());
  const [deviceToken, setDeviceToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [screenshotDeviceId, setScreenshotDeviceId] = useState<string | null>(null);
  const [remoteControlDeviceId, setRemoteControlDeviceId] = useState<string | null>(null);
  const [latestThumbs, setLatestThumbs] = useState<Record<string, string>>({});
  const [showControls, setShowControls] = useState<Record<string, boolean>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({ deviceId: '', name: '', description: '', location: '' });
  const [displayConfigData, setDisplayConfigData] = useState({ displayWidth: 1920, displayHeight: 1080, kioskMode: true });
  const [showTagManagementModal, setShowTagManagementModal] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<number[]>([]);

  const isDeviceOnline = (deviceId: string) => connectedDevices.has(deviceId);

  useEffect(() => { fetchDevices(); fetchPlaylists(); loadTags(); }, [fetchDevices, fetchPlaylists]);

  const loadTags = async () => {
    try {
      const tags = await tagService.getAll();
      setAllTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const toggleFilterTag = (tagId: number) => {
    setSelectedFilterTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const filteredDevices = selectedFilterTags.length === 0
    ? devices
    : devices.filter(device =>
        selectedFilterTags.every(tagId =>
          device.tags?.some(tag => tag.id === tagId)
        )
      );

  useEffect(() => {
    const loadThumbs = async () => {
      const map: Record<string, string> = {};
      for (const d of devices) {
        try {
          const s = await screenshotService.getLatestByDevice(d.deviceId);
          if (s && (s as any).imageData) {
            const data = (s as any).imageData as string;
            map[d.deviceId] = data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
          }
        } catch {}
      }
      setLatestThumbs(map);
    };
    if (devices.length) loadThumbs();

    const onShot = async (payload: any) => {
      const devId = payload.deviceId as string;
      try {
        const s = await screenshotService.getLatestByDevice(devId);
        if (s && (s as any).imageData) {
          const data = (s as any).imageData as string;
          setLatestThumbs(prev => ({ ...prev, [devId]: data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}` }));
        }
      } catch {}
    };
    websocketService.onScreenshotReceived(onShot);
    return () => websocketService.offScreenshotReceived(onShot);
  }, [devices]);

  const toggleControls = (deviceId: string) => {
    setShowControls(prev => ({ ...prev, [deviceId]: !prev[deviceId] }));
  };

  useEffect(() => {
    const measureHeights = () => {
      const next: Record<string, number> = {};
      for (const d of devices) {
        const front = document.getElementById(`card-front-${d.id}`);
        const back = document.getElementById(`card-back-${d.id}`);
        const frontH = front ? (front as HTMLElement).scrollHeight : 0;
        const backH = back ? (back as HTMLElement).scrollHeight : 0;
        const maxH = Math.max(frontH, backH);
        if (maxH) next[d.deviceId] = maxH;
      }
      if (Object.keys(next).length) setCardHeights(next);
    };
    const t = setTimeout(measureHeights, 0);
    return () => clearTimeout(t);
  }, [devices, showControls]);

  useEffect(() => {
    const loadDevicePlaylists = async () => {
      const playlistMap = new Map<number, Playlist[]>();
      for (const device of devices) {
        try {
          const pls = await playlistService.getDevicePlaylists(device.id);
          playlistMap.set(device.id, pls);
        } catch {}
      }
      setDevicePlaylists(playlistMap);
    };
    if (devices.length > 0) loadDevicePlaylists();
  }, [devices]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        await updateDevice(editingDevice, formData);
        setShowModal(false); setEditingDevice(null); setFormData({ deviceId: '', name: '', description: '', location: '' }); fetchDevices();
      } else {
        const device = await createDevice(formData);
        setShowModal(false); setFormData({ deviceId: '', name: '', description: '', location: '' });
        if (device.token) { setDeviceToken(device.token); setShowTokenModal(true); setCopiedToken(false); }
        fetchDevices();
      }
    } catch {}
  };

  const handleEdit = (device: any) => { setFormData({ deviceId: device.deviceId, name: device.name, description: device.description || '', location: device.location || '' }); setEditingDevice(device.id); setShowModal(true); };
  const handleCopyToken = async () => { try { await navigator.clipboard.writeText(deviceToken); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); } catch {} };
  const handleDelete = async (id: number) => { if (confirm('Are you sure you want to delete this device?')) await deleteDevice(id); };
  const handleShowToken = async (id: number) => { try { const token = await getDeviceToken(id); setDeviceToken(token); setCopiedToken(false); setShowTokenModal(true); } catch {} };
  const handleOpenPlaylistModal = (deviceId: number) => { setSelectedDeviceForPlaylist(deviceId); setShowPlaylistModal(true); };
  const handleAssignPlaylist = async (playlistId: number) => { if (!selectedDeviceForPlaylist) return; try { await assignPlaylistToDevice(selectedDeviceForPlaylist, playlistId); const pls = await playlistService.getDevicePlaylists(selectedDeviceForPlaylist); setDevicePlaylists(prev => new Map(prev).set(selectedDeviceForPlaylist, pls)); setShowPlaylistModal(false); } catch {} };
  const handleUnassignPlaylist = async (deviceId: number, playlistId: number) => { if (confirm('Are you sure you want to unassign this playlist?')) { try { await unassignPlaylistFromDevice(deviceId, playlistId); const pls = await playlistService.getDevicePlaylists(deviceId); setDevicePlaylists(prev => new Map(prev).set(deviceId, pls)); } catch {} } };
  const handleOpenDisplayConfig = (device: any) => { setConfiguringDevice(device); setDisplayConfigData({ displayWidth: device.displayWidth || 1920, displayHeight: device.displayHeight || 1080, kioskMode: device.kioskMode !== undefined ? device.kioskMode : true }); setShowDisplayConfigModal(true); };
  const handleSaveDisplayConfig = async () => { if (!configuringDevice) return; try { await updateDevice(configuringDevice.id, displayConfigData); setShowDisplayConfigModal(false); setConfiguringDevice(null); fetchDevices(); } catch {} };

  // Device control handlers
  const handleRestart = async (deviceId: string, deviceName: string) => { if (confirm(`Are you sure you want to restart ${deviceName}? The client will restart and reconnect.`)) { try { await deviceService.restart(deviceId); } catch (err) { console.error('Failed to restart device:', err); } } };

  // Playlist control handlers
  const handlePlaylistPause = async (deviceId: string) => { try { await deviceService.playlistPause(deviceId); } catch (err) { console.error('Failed to pause playlist:', err); } };
  const handlePlaylistResume = async (deviceId: string) => { try { await deviceService.playlistResume(deviceId); } catch (err) { console.error('Failed to resume playlist:', err); } };
  const handlePlaylistNext = async (deviceId: string) => { try { await deviceService.playlistNext(deviceId, true); } catch (err) { console.error('Failed to skip to next:', err); } };
  const handlePlaylistPrevious = async (deviceId: string) => { try { await deviceService.playlistPrevious(deviceId, true); } catch (err) { console.error('Failed to go to previous:', err); } };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Devices</h1>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowTagManagementModal(true)}
            className="px-3 sm:px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-sm min-h-[44px] flex-1 sm:flex-initial"
          >
            <span className="hidden sm:inline">Manage Tags</span>
            <span className="sm:hidden">Tags</span>
          </button>
          <button
            onClick={() => { setEditingDevice(null); setFormData({ deviceId: '', name: '', description: '', location: '' }); setShowModal(true); }}
            className="btn-primary min-h-[44px] flex-1 sm:flex-initial"
          >
            <span className="hidden sm:inline">+ Add Device</span>
            <span className="sm:hidden">+ Add</span>
          </button>
        </div>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 w-full sm:w-auto mb-1 sm:mb-0">Filter by tags:</span>
            {allTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleFilterTag(tag.id)}
                className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-opacity min-h-[36px] ${
                  selectedFilterTags.includes(tag.id)
                    ? 'opacity-100'
                    : 'opacity-50 hover:opacity-75'
                }`}
                style={{
                  backgroundColor: tag.color,
                  color: 'white'
                }}
              >
                {tag.name}
                {selectedFilterTags.includes(tag.id) && ' ✓'}
              </button>
            ))}
            {selectedFilterTags.length > 0 && (
              <button
                onClick={() => setSelectedFilterTags([])}
                className="text-xs sm:text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 min-h-[36px]"
              >
                Clear filters
              </button>
            )}
          </div>
          {selectedFilterTags.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Showing {filteredDevices.length} of {devices.length} devices
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">Loading devices...</p></div>
      ) : devices.length === 0 ? (
        <div className="card text-center py-12"><p className="text-gray-600 dark:text-gray-400 mb-4">No devices registered yet.</p><button onClick={() => setShowModal(true)} className="btn-primary">Add Your First Device</button></div>
      ) : filteredDevices.length === 0 ? (
        <div className="card text-center py-12"><p className="text-gray-600 dark:text-gray-400 mb-4">No devices match the selected filters.</p><button onClick={() => setSelectedFilterTags([])} className="btn-secondary">Clear Filters</button></div>
      ) : (
        <div className="gap-3 sm:gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filteredDevices.map((device) => (
            <div key={device.id} className="card overflow-visible" style={{ perspective: '1000px' }}>
              <div className="relative" style={{ transformStyle: 'preserve-3d', transition: 'transform 600ms', transform: showControls[device.deviceId] ? 'rotateY(180deg)' : 'rotateY(0deg)', height: cardHeights[device.deviceId] ? `${cardHeights[device.deviceId]}px` : 'auto' }}>
                <div id={`card-front-${device.id}`} className="absolute inset-0 p-2.5" style={{ backfaceVisibility: 'hidden' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                        <button
                          onClick={() => handleEdit(device)}
                          className="hover:underline cursor-pointer text-left"
                          title="Edit device"
                        >
                          {device.name}
                        </button>
                      </h3>
                      <PlaybackControlsInline
                        deviceId={device.deviceId}
                        playbackState={devicePlaybackState.get(device.deviceId)}
                        onPause={handlePlaylistPause}
                        onResume={handlePlaylistResume}
                        onNext={handlePlaylistNext}
                        onPrevious={handlePlaylistPrevious}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {isDeviceOnline(device.deviceId) && (<span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>)}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${isDeviceOnline(device.deviceId) ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>{isDeviceOnline(device.deviceId) ? 'online' : 'offline'}</span>
                    </div>
                  </div>
                  {latestThumbs[device.deviceId] ? (
                    <div className="w-full bg-black rounded overflow-hidden cursor-pointer" style={{ aspectRatio: '16/9' }} onClick={() => toggleControls(device.deviceId)}>
                      <img
                        src={latestThumbs[device.deviceId]}
                        alt="Latest screenshot"
                        className="w-full h-full object-contain"
                        onLoad={() => {
                          // Re-measure after image load to fix initial short height
                          setTimeout(() => {
                            const front = document.getElementById(`card-front-${device.id}`);
                            const back = document.getElementById(`card-back-${device.id}`);
                            const frontH = front ? (front as HTMLElement).scrollHeight : 0;
                            const backH = back ? (back as HTMLElement).scrollHeight : 0;
                            const maxH = Math.max(frontH, backH);
                            if (maxH) {
                              setCardHeights(prev => ({ ...prev, [device.deviceId]: maxH }));
                            }
                          }, 0);
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="w-full bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center cursor-pointer"
                      style={{ aspectRatio: '16/9' }}
                      onClick={() => toggleControls(device.deviceId)}
                    >
                      <div className="text-center p-3">
                        <svg className="w-6 h-6 text-gray-400 dark:text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h3l2-2h4l2 2h3a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                        <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">No screenshot</p>
                      </div>
                    </div>
                  )}
                  {/* Active playlist summary moved to front */}
                  {devicePlaylists.get(device.id)?.find(p => p.isActive) && (() => {
                    const active = devicePlaylists.get(device.id)!.find(p => p.isActive)!;
                    return (
                      <div className="mt-2 bg-gray-50 dark:bg-gray-700 rounded px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Active Playlist</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{active.name}</p>
                          </div>
                          <button
                            onClick={() => handleUnassignPlaylist(device.id, active.id)}
                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Tags */}
                  <div className="mt-2">
                    <TagSelector
                      deviceId={device.id}
                      deviceTags={device.tags || []}
                      onTagsChanged={fetchDevices}
                    />
                  </div>
                  {device.description && (<p className="text-gray-600 dark:text-gray-400 text-sm mb-2">{device.description}</p>)}
                  {device.location && (<p className="text-gray-600 dark:text-gray-400 text-sm"><span className="font-medium">Location:</span> {device.location}</p>)}
                </div>
                <div id={`card-back-${device.id}`} className="absolute inset-0 p-2.5" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <div className="flex items-start justify-between mb-2"><div className="sr-only">Controls</div><button className="text-sm text-gray-600 dark:text-gray-300 hover:underline" onClick={() => toggleControls(device.deviceId)}>Back</button></div>
                  <div className="flex flex-col gap-3 mt-2">
                    <button onClick={() => handleOpenPlaylistModal(device.id)} className="btn-secondary text-sm">Assign Playlist</button>
                    <button onClick={() => setScreenshotDeviceId(device.deviceId)} className="btn-primary text-sm flex-1 min-w-[140px]">Screenshot</button>
                    <button onClick={() => setRemoteControlDeviceId(device.deviceId)} className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex-1 min-w-[140px]" title="Remote Control">Remote</button>
                    <button onClick={() => handleOpenDisplayConfig(device)} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm flex-1 min-w-[140px]" title="Configure Display">Configure Display</button>
                    <button onClick={() => handleRestart(device.deviceId, device.name)} className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex-1 min-w-[140px]" title="Restart Client">Restart</button>
                    <button onClick={() => handleShowToken(device.id)} className="btn-secondary text-sm flex-1 min-w-[140px]">Get Token</button>
                    <button onClick={() => handleDelete(device.id)} className="btn-danger text-sm flex-1 min-w-[140px]">Delete</button>
                    <div className="mt-2">
                      {devicePlaylists.get(device.id)?.length ? (
                        <div className="space-y-2">
                          {devicePlaylists.get(device.id)!.filter(p => !p.isActive).map((playlist) => (
                            <div key={playlist.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{playlist.name}</p>
                              </div>
                              <button onClick={() => handleUnassignPlaylist(device.id, playlist.id)} className="ml-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm">Remove</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No playlists assigned</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      

      {/* Add/Edit Device Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              {editingDevice ? 'Edit Device' : 'Add New Device'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device ID
                </label>
                <input
                  type="text"
                  value={formData.deviceId}
                  onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                  className="input"
                  placeholder="e.g., rpi-001"
                  required
                  disabled={!!editingDevice}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Lobby Display"
                  required
                />
              </div>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="input"
                  placeholder="e.g., Building A - Floor 1"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingDevice(null);
                    setFormData({ deviceId: '', name: '', description: '', location: '' });
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {editingDevice ? 'Update Device' : 'Add Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-2xl w-full shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Device Token</h2>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm font-medium">
                  ⚠️ Important: This token will only be shown once!
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                  Copy it now and store it securely. You'll need it to configure your device.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Authentication Token
                </label>
                <div className="relative">
                  <textarea
                    value={deviceToken}
                    readOnly
                    className="input font-mono text-sm resize-none"
                    rows={6}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    copiedToken
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {copiedToken ? '✓ Copied!' : 'Copy Token'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="btn-secondary flex-1"
                >
                  Close
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 text-sm">
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                  Next Steps:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li>Copy the token above</li>
                  <li>Add it to your device's .env file as DEVICE_TOKEN</li>
                  <li>Configure DEVICE_ID in .env to match the device ID</li>
                  <li>Start the device client to connect</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Viewer Modal */}
      {screenshotDeviceId && (
        <ScreenshotViewer
          deviceId={screenshotDeviceId}
          onClose={() => setScreenshotDeviceId(null)}
        />
      )}

      {/* Live Remote Control Modal */}
      {remoteControlDeviceId && (
        <LiveRemoteControl
          deviceId={remoteControlDeviceId}
          deviceName={devices.find(d => d.deviceId === remoteControlDeviceId)?.name || remoteControlDeviceId}
          onClose={() => setRemoteControlDeviceId(null)}
        />
      )}

      {/* Display Configuration Modal */}
      {showDisplayConfigModal && configuringDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Configure Display: {configuringDevice.name}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Width (px)
                </label>
                <input
                  type="number"
                  value={displayConfigData.displayWidth}
                  onChange={(e) => setDisplayConfigData({ ...displayConfigData, displayWidth: parseInt(e.target.value) || 1920 })}
                  className="input w-full"
                  placeholder="1920"
                  min="640"
                  max="7680"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Height (px)
                </label>
                <input
                  type="number"
                  value={displayConfigData.displayHeight}
                  onChange={(e) => setDisplayConfigData({ ...displayConfigData, displayHeight: parseInt(e.target.value) || 1080 })}
                  className="input w-full"
                  placeholder="1080"
                  min="480"
                  max="4320"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="kioskMode"
                  checked={displayConfigData.kioskMode}
                  onChange={(e) => setDisplayConfigData({ ...displayConfigData, kioskMode: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="kioskMode" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Kiosk Mode (fullscreen, no browser UI)
                </label>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> Changing display settings will restart the browser on the client device.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowDisplayConfigModal(false);
                  setConfiguringDevice(null);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDisplayConfig}
                className="btn-primary flex-1"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Assignment Modal */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Assign Playlist</h2>

            {playlists.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No playlists available. Create a playlist first.
                </p>
                <button
                  onClick={() => setShowPlaylistModal(false)}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select a playlist to assign to this device:
                </p>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {playlists.map((playlist) => {
                    const alreadyAssigned = selectedDeviceForPlaylist
                      ? devicePlaylists.get(selectedDeviceForPlaylist)?.some(p => p.id === playlist.id)
                      : false;

                    return (
                      <button
                        key={playlist.id}
                        onClick={() => handleAssignPlaylist(playlist.id)}
                        disabled={alreadyAssigned}
                        className={`w-full text-left p-4 rounded-lg border transition-colors ${
                          alreadyAssigned
                            ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-50'
                            : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {playlist.name}
                            </p>
                            {playlist.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {playlist.description}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2">
                              {playlist.isActive && (
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
                                  Active
                                </span>
                              )}
                              {alreadyAssigned && (
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded">
                                  Already Assigned
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPlaylistModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tag Management Modal */}
      <TagManagementModal
        isOpen={showTagManagementModal}
        onClose={() => setShowTagManagementModal(false)}
        onTagsChanged={fetchDevices}
      />
    </div>
  );
};
