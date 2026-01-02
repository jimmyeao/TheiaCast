import { useWebSocketStore } from '../store/websocketStore';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export const Notifications = () => {
  const { notifications, removeNotification } = useWebSocketStore();

  const getIcon = (type: 'info' | 'success' | 'warning' | 'error') => {
    const iconClasses = 'h-6 w-6';
    switch (type) {
      case 'success':
        return <CheckCircleIcon className={`${iconClasses} text-green-500`} />;
      case 'warning':
        return <ExclamationCircleIcon className={`${iconClasses} text-yellow-500`} />;
      case 'error':
        return <XCircleIcon className={`${iconClasses} text-red-500`} />;
      default:
        return <InformationCircleIcon className={`${iconClasses} text-blue-500`} />;
    }
  };

  const getBackgroundColor = (type: 'info' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            pointer-events-auto
            max-w-sm w-full
            ${getBackgroundColor(notification.type)}
            border rounded-lg shadow-lg
            p-4
            transition-all duration-300 ease-in-out
            animate-slide-in-right
          `}
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">{getIcon(notification.type)}</div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                {notification.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {notification.message}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {new Date(notification.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0">
              <button
                onClick={() => removeNotification(notification.id)}
                className="inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
