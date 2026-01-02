import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

export const DashboardLayout = () => {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [customLogo, setCustomLogo] = useState<string>('');

  // Fetch branding settings
  useEffect(() => {
    const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    const lighten = (rgb: { r: number; g: number; b: number }, percent: number) => {
      return {
        r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * percent)),
        g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * percent)),
        b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * percent))
      };
    };

    const darken = (rgb: { r: number; g: number; b: number }, percent: number) => {
      return {
        r: Math.round(rgb.r * (1 - percent)),
        g: Math.round(rgb.g * (1 - percent)),
        b: Math.round(rgb.b * (1 - percent))
      };
    };

    const fetchBranding = async () => {
      try {
        // Check license status first - branding requires paid tier (not free)
        const licenseResponse = await api.get('/license/status').catch(() => ({ data: { isValid: false, tier: 'free' } }));
        const tier = licenseResponse.data.tier || 'free';
        const isPaidTier = tier !== 'free' && licenseResponse.data.isValid;

        // Only fetch and apply branding if user has a paid tier license
        if (!isPaidTier) {
          return;
        }

        const logoResponse = await api.get('/settings/branding.logo').catch(() => ({ data: { value: '' } }));
        setCustomLogo(logoResponse.data.value || '');

        const colorResponse = await api.get('/settings/branding.primaryColor').catch(() => ({ data: { value: '#ea580c' } }));
        const color = colorResponse.data.value || '#ea580c';

        // Convert hex to RGB and generate color shades
        const rgb = hexToRgb(color);
        if (rgb) {
          const shades = {
            50: lighten(rgb, 0.95),
            100: lighten(rgb, 0.90),
            200: lighten(rgb, 0.75),
            300: lighten(rgb, 0.60),
            400: lighten(rgb, 0.30),
            500: rgb,
            600: darken(rgb, 0.10),
            700: darken(rgb, 0.25),
            800: darken(rgb, 0.40),
            900: darken(rgb, 0.55)
          };

          // Apply CSS variables for all shades
          Object.entries(shades).forEach(([shade, color]) => {
            document.documentElement.style.setProperty(
              `--brand-${shade}`,
              `${color.r} ${color.g} ${color.b}`
            );
          });
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
      }
    };
    fetchBranding();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navLinkClass = (path: string) => {
    const base = 'block px-4 py-2 rounded-lg transition-all duration-200 font-medium';
    return isActive(path)
      ? `${base} bg-gradient-to-r from-brand-orange-500 to-brand-orange-600 text-white dark:from-brand-orange-400 dark:to-brand-orange-500 dark:text-gray-900 shadow-brand`
      : `${base} text-gray-700 hover:bg-brand-orange-50 dark:text-gray-300 dark:hover:bg-gray-700 hover:text-brand-orange-600 dark:hover:text-brand-orange-400`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Navbar */}
      <nav className="bg-white dark:bg-gray-800 shadow-md">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>

              <div className="flex items-center space-x-3">
                {customLogo ? (
                  <img
                    src={customLogo}
                    alt="Brand Logo"
                    className="h-10 max-w-[200px] object-contain transition-transform hover:scale-105"
                  />
                ) : (
                  <>
                    <img
                      src="/logo.png"
                      alt="TheiaCast Logo"
                      className="h-8 w-8 transition-transform hover:scale-105"
                    />
                    <div className="flex flex-col">
                      <h1 className="text-xl font-bold bg-gradient-to-r from-brand-orange-500 to-brand-orange-600 bg-clip-text text-transparent dark:from-brand-orange-400 dark:to-brand-orange-500">
                        TheiaCast
                      </h1>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 -mt-1">
                        Digital Signage
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Dark Mode Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Username - hidden on small screens */}
              <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                <span className="hidden md:inline">Welcome, </span><span className="font-medium text-gray-900 dark:text-white">{user?.username}</span>
              </span>

              <button
                onClick={handleLogout}
                className="btn-secondary text-sm min-h-[44px]"
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar - Desktop: fixed width, Mobile: overlay */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 shadow-md flex-shrink-0 overflow-y-auto
          transform transition-transform duration-300 ease-in-out lg:transform-none
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          mt-16 lg:mt-0
        `}>
          <nav className="p-4 space-y-2">
            <Link to="/" className={navLinkClass('/')} onClick={closeMobileMenu}>
              📊 Dashboard
            </Link>
            <Link to="/devices" className={navLinkClass('/devices')} onClick={closeMobileMenu}>
              💻 Devices
            </Link>
            <Link to="/content" className={navLinkClass('/content')} onClick={closeMobileMenu}>
              🎬 Content
            </Link>
            <Link to="/playlists" className={navLinkClass('/playlists')} onClick={closeMobileMenu}>
              📅 Playlists
            </Link>
            <Link to="/logs" className={navLinkClass('/logs')} onClick={closeMobileMenu}>
              📝 Logs
            </Link>
            <Link to="/users" className={navLinkClass('/users')} onClick={closeMobileMenu}>
              👥 Users
            </Link>
            <Link to="/license" className={navLinkClass('/license')} onClick={closeMobileMenu}>
              🔑 License
            </Link>
            <Link to="/settings" className={navLinkClass('/settings')} onClick={closeMobileMenu}>
              ⚙️ Settings
            </Link>
          </nav>
        </aside>

        {/* Mobile Menu Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden mt-16"
            onClick={closeMobileMenu}
          />
        )}

        {/* Main Content - Scrollable */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
