import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Plus, X, Globe, ShieldCheck, Download, FolderDown, Ghost } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';

interface Tab {
  id: string;
  history: string[];
  historyIndex: number;
  title: string;
  isLoading: boolean;
  reloadKey: number;
}

interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  timestamp: number;
}

export default function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([{
    id: 'tab-' + Date.now(),
    history: ['https://www.google.com/'],
    historyIndex: 0,
    title: 'New Tab',
    isLoading: true,
    reloadKey: 0,
  }]);
  
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);

  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const currentUrl = activeTab.history[activeTab.historyIndex] || '';

  const [urlInput, setUrlInput] = useState(currentUrl);

  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl, activeTabId]);

  useEffect(() => {
    const handleBackButton = () => {
      setTabs(prevTabs => {
        const currentActiveTab = prevTabs.find(t => t.id === activeTabId);
        if (currentActiveTab && currentActiveTab.historyIndex > 0) {
          return prevTabs.map(tab => {
            if (tab.id === activeTabId) {
              return { ...tab, historyIndex: tab.historyIndex - 1, isLoading: true };
            }
            return tab;
          });
        } else {
          CapApp.exitApp();
          return prevTabs;
        }
      });
    };

    const listenerPromise = CapApp.addListener('backButton', handleBackButton);
    return () => {
      listenerPromise.then(listener => listener.remove());
    };
  }, [activeTabId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, url, title, tabId } = event.data;
      if (!tabId) return;

      if (type === 'navigate' && url) {
        handleNavigateToUrl(tabId, url);
      } else if (type === 'title' && title) {
        setTabs(currentTabs => currentTabs.map(tab => 
          tab.id === tabId ? { ...tab, title } : tab
        ));
      } else if (type === 'download' && url) {
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        
        let filename = 'download';
        try {
          const parts = new URL(url).pathname.split('/');
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.includes('.')) filename = lastPart;
          else filename = 'media-file';
        } catch(e) {}
        
        setDownloads(prev => [{
          id: Date.now().toString(),
          url: downloadUrl,
          filename,
          timestamp: Date.now()
        }, ...prev]);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = ''; // Let the backend content-disposition handle the filename
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const parseInput = (input: string) => {
    let finalUrl = input.trim();
    if (!finalUrl) return '';

    // If it has spaces or no dot, treat as search
    if (!finalUrl.includes('.') || finalUrl.includes(' ')) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    return finalUrl;
  };

  const handleNavigateToUrl = (targetTabId: string, inputUrl: string) => {
    const finalUrl = parseInput(inputUrl);
    if (!finalUrl) return;

    setTabs(currentTabs => currentTabs.map(tab => {
      if (tab.id === targetTabId) {
        const currentUrlInTab = tab.history[tab.historyIndex];
        if (currentUrlInTab === finalUrl) return tab; // Ignore same navigation

        const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), finalUrl];
        return { 
          ...tab, 
          history: newHistory, 
          historyIndex: newHistory.length - 1, 
          isLoading: true 
        };
      }
      return tab;
    }));
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigateToUrl(activeTabId, urlInput);
  };

  const createTab = () => {
    const newTab: Tab = {
      id: 'tab-' + Date.now(),
      history: ['https://www.google.com/'],
      historyIndex: 0,
      title: 'New Tab',
      isLoading: true,
      reloadKey: 0,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (e: React.MouseEvent, idToRemove: string) => {
    e.stopPropagation();
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== idToRemove);
      if (filtered.length === 0) {
        // If last tab closed, create a new one
        const newTab: Tab = {
          id: 'tab-' + Date.now(),
          history: ['https://www.google.com/'],
          historyIndex: 0,
          title: 'New Tab',
          isLoading: true,
          reloadKey: 0,
        };
        setActiveTabId(newTab.id);
        return [newTab];
      }
      if (activeTabId === idToRemove) {
        // Switch to the previous tab
        const closedIndex = prev.findIndex(t => t.id === idToRemove);
        const nextActive = prev[Math.max(0, closedIndex - 1)];
        setActiveTabId(nextActive.id);
      }
      return filtered;
    });
  };

  const navigateBack = () => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId && tab.historyIndex > 0) {
        return { ...tab, historyIndex: tab.historyIndex - 1, isLoading: true };
      }
      return tab;
    }));
  };

  const navigateForward = () => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId && tab.historyIndex < tab.history.length - 1) {
        return { ...tab, historyIndex: tab.historyIndex + 1, isLoading: true };
      }
      return tab;
    }));
  };

  const reloadTab = () => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        return { ...tab, isLoading: true, reloadKey: tab.reloadKey + 1 };
      }
      return tab;
    }));
  };

  const handleIframeLoad = (tabId: string) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId ? { ...tab, isLoading: false } : tab
    ));
  };

  return (
    <div className={`flex flex-col h-screen ${isIncognito ? 'bg-indigo-950 text-indigo-100' : 'bg-neutral-900 text-neutral-200'} font-sans overflow-hidden`}>
      
      {/* Title Bar & Tabs */}
      <div className={`flex items-end px-2 pt-2 ${isIncognito ? 'bg-black border-indigo-900' : 'bg-neutral-950 border-neutral-800'} border-b space-x-1`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center h-9 px-3 min-w-[140px] max-w-[200px] cursor-pointer rounded-t-lg transition-colors ${
                isActive 
                  ? (isIncognito ? 'bg-indigo-950 text-white' : 'bg-neutral-800 text-white')
                  : (isIncognito ? 'bg-transparent text-indigo-400 hover:bg-indigo-950/70 hover:text-white' : 'bg-transparent text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200')
              }`}
            >
              <div className="flex-shrink-0 mr-2">
                {tab.isLoading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-neutral-500 border-t-white animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 opacity-70" />
                )}
              </div>
              <span className="truncate flex-1 text-xs font-medium tracking-wide">
                {tab.title}
              </span>
              <button
                onClick={(e) => closeTab(e, tab.id)}
                className={`ml-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
                  isActive ? 'hover:bg-neutral-700' : 'hover:bg-neutral-700'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        <button
          onClick={createTab}
          className="h-8 w-8 mb-0.5 ml-1 flex items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className={`flex items-center px-4 py-2.5 ${isIncognito ? 'bg-indigo-950 border-indigo-900' : 'bg-neutral-800 border-neutral-700'} border-b space-x-3 shadow-sm`}>
        <div className="flex items-center space-x-1">
          <button 
            onClick={navigateBack} 
            disabled={activeTab.historyIndex === 0}
            className={`p-1.5 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors ${isIncognito ? 'text-indigo-200 hover:bg-indigo-900' : 'text-neutral-300 hover:bg-neutral-700'}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={navigateForward}
            disabled={activeTab.historyIndex === activeTab.history.length - 1}
            className={`p-1.5 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors ${isIncognito ? 'text-indigo-200 hover:bg-indigo-900' : 'text-neutral-300 hover:bg-neutral-700'}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button 
            onClick={reloadTab}
            className={`p-1.5 rounded-md transition-colors ${isIncognito ? 'text-indigo-200 hover:bg-indigo-900' : 'text-neutral-300 hover:bg-neutral-700'}`}
          >
            <RotateCw className={`w-4 h-4 ${activeTab.isLoading ? 'animate-spin opacity-50' : ''}`} />
          </button>
        </div>

        <form onSubmit={handleAddressSubmit} className="flex-1 max-w-4xl flex relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-500">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={`w-full ${isIncognito ? 'bg-indigo-900 border-indigo-700 focus:border-indigo-400 focus:ring-indigo-400 text-white' : 'bg-neutral-900 border-neutral-700 focus:border-neutral-500 focus:ring-neutral-500 text-neutral-100'} border text-sm rounded-full pl-9 pr-4 py-1.5 focus:outline-none focus:ring-1 transition-all shadow-inner`}
            placeholder="Search the web or enter URL..."
          />
        </form>

        <div className="flex-shrink-0 text-xs font-semibold text-emerald-400 border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-1 rounded-full flex items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
          Tracker Protection
        </div>

        <button
          onClick={() => setIsIncognito(!isIncognito)}
          className={`p-1.5 rounded-md flex items-center space-x-1 transition-colors border ${
            isIncognito ? 'bg-indigo-900 text-indigo-200 border-indigo-700/50 shadow-inner' : 'border-transparent text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
          }`}
          title="Toggle Incognito Mode"
        >
          <Ghost className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowDownloads(!showDownloads)}
          className={`p-1.5 rounded-md transition-colors relative ${showDownloads ? (isIncognito ? 'bg-indigo-800 text-white' : 'bg-neutral-700 text-white') : (isIncognito ? 'text-indigo-300 hover:bg-indigo-900 hover:text-white' : 'text-neutral-300 hover:bg-neutral-700 hover:text-white')}`}
          title="Downloads"
        >
          <Download className="w-5 h-5" />
          {downloads.length > 0 && (
            <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-emerald-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-md">
              {downloads.length}
            </span>
          )}
        </button>
      </div>

      {/* Viewport Area */}
      <div className={`flex-1 relative ${isIncognito ? 'bg-indigo-950' : 'bg-white'}`}>
        
        {/* Loading Animation Overlay */}
        <div 
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none backdrop-blur-sm ${
            activeTab.isLoading ? 'opacity-100' : 'opacity-0'
          } ${isIncognito ? 'bg-indigo-950/90 text-indigo-300' : 'bg-white/90 text-neutral-500'}`}
        >
          <div className={`w-12 h-12 border-4 rounded-full animate-spin mb-4 shadow-sm ${isIncognito ? 'border-indigo-500/30 border-t-indigo-400' : 'border-emerald-500/30 border-t-emerald-500'}`} />
          <span className="text-sm font-medium tracking-wide">Loading {activeTab.title !== 'New Tab' ? 'page' : ''}...</span>
        </div>

        {showDownloads && (
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-neutral-900 border-l border-neutral-700 z-50 flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <div className="flex items-center space-x-2 text-neutral-200 font-medium">
                <FolderDown className="w-5 h-5" />
                <span>Downloads</span>
              </div>
              <button onClick={() => setShowDownloads(false)} className="text-neutral-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {downloads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-neutral-500">
                  <FolderDown className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">No recent downloads</p>
                </div>
              ) : (
                downloads.map(dl => (
                  <div key={dl.id} className="p-3 bg-neutral-800 rounded-lg flex flex-col space-y-2 border border-neutral-700 shadow-sm">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-neutral-200 truncate pr-2 font-medium" title={dl.filename}>
                        {dl.filename}
                      </span>
                      <a 
                        href={dl.url} 
                        download
                        className="text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 rounded transition-colors"
                        title="Redownload"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                    <div className="text-xs text-neutral-500 flex justify-between items-center">
                      <span>{new Date(dl.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-emerald-500 font-medium bg-emerald-950/50 px-1.5 py-0.5 rounded text-[10px]">Completed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {tabs.map((tab) => {
          const tabUrl = tab.history[tab.historyIndex];
          // We proxy the URL through our local backend
          const proxyUrl = `/api/browse?url=${encodeURIComponent(tabUrl)}&incognito=${isIncognito}`;

          return (
            <iframe
              key={tab.id}
              name={tab.id}
              src={proxyUrl}
              onLoad={() => handleIframeLoad(tab.id)}
              className={`absolute inset-0 w-full h-full border-none ${
                tab.id === activeTabId ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
              sandbox="allow-same-origin allow-forms allow-popups allow-scripts"
              title={tab.title}
            />
          );
        })}
      </div>
    </div>
  );
}
