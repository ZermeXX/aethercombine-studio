/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Film,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Type,
  Wand2,
  X
} from 'lucide-react';
import {
  FILM_GAME_FONT_PRESETS,
  GOOGLE_FONT_PRESETS,
  StudioFontEntry,
  ensureFontEntryLoaded,
  matchCinemaFontWithAI,
  registerCustomFontFile,
  useAiMatchedFonts,
  useCustomUploadedFonts
} from '../utils/fontCatalog';

export interface CompactFontSelectorProps {
  selectedFontId: string;
  onSelectFont: (entry: StudioFontEntry) => void;
  onNotify?: (msg: string, type?: 'info' | 'error' | 'success') => void;
  onFontLoaded?: () => void;
  label?: string;
  align?: 'left' | 'right';
  accentTone?: 'amber' | 'cyan';
}

export const CompactFontSelector: React.FC<CompactFontSelectorProps> = ({
  selectedFontId,
  onSelectFont,
  onNotify,
  onFontLoaded,
  label,
  align = 'left',
  accentTone = 'amber'
}) => {
  const customFonts = useCustomUploadedFonts();
  const aiMatchedFonts = useAiMatchedFonts();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'film_game' | 'google'>('film_game');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isUploadingFont, setIsUploadingFont] = useState<boolean>(false);
  const [isAiMatchingFont, setIsAiMatchingFont] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fontFileInputRef = useRef<HTMLInputElement | null>(null);

  const allEntries = useMemo(
    () => [...customFonts, ...aiMatchedFonts, ...FILM_GAME_FONT_PRESETS, ...GOOGLE_FONT_PRESETS],
    [customFonts, aiMatchedFonts]
  );

  const selectedEntry = useMemo(
    () => allEntries.find(e => e.id === selectedFontId) || GOOGLE_FONT_PRESETS[0],
    [allEntries, selectedFontId]
  );

  useEffect(() => {
    if (selectedEntry.source === 'film_game') {
      setActiveTab('film_game');
    } else if (selectedEntry.source === 'google') {
      setActiveTab('google');
    }
  }, [selectedEntry.id, selectedEntry.source]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen]);

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const matchesQuery = (entry: StudioFontEntry, q: string) => {
    if (!q) return true;
    const haystack = [
      entry.title,
      entry.referenceFont || '',
      entry.equivalentLabel,
      entry.primaryFamily,
      entry.secondaryFamily || '',
      entry.searchKeywords
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  };

  const filteredCustomFonts = useMemo(
    () => customFonts.filter(entry => matchesQuery(entry, normalizedQuery)),
    [customFonts, normalizedQuery]
  );

  const allFilmPresets = useMemo(
    () => [...aiMatchedFonts, ...FILM_GAME_FONT_PRESETS],
    [aiMatchedFonts]
  );

  const filteredTabFonts = useMemo(() => {
    const sourceList = activeTab === 'film_game' ? allFilmPresets : GOOGLE_FONT_PRESETS;
    return sourceList.filter(entry => matchesQuery(entry, normalizedQuery));
  }, [activeTab, allFilmPresets, normalizedQuery]);

  const hasExactFilmMatch = useMemo(() => {
    if (!normalizedQuery) return true;
    return allFilmPresets.some(entry =>
      entry.title.toLowerCase().split('/').some(part => part.trim() === normalizedQuery)
    );
  }, [allFilmPresets, normalizedQuery]);

  const showAiMatcherCta =
    normalizedQuery.length >= 2 &&
    (activeTab === 'film_game' || filteredTabFonts.length === 0) &&
    !hasExactFilmMatch;

  const otherTabMatchCount = useMemo(() => {
    if (!normalizedQuery) return 0;
    const otherList = activeTab === 'film_game' ? GOOGLE_FONT_PRESETS : allFilmPresets;
    return otherList.filter(entry => matchesQuery(entry, normalizedQuery)).length;
  }, [activeTab, allFilmPresets, normalizedQuery]);

  const handleSelectEntry = (entry: StudioFontEntry) => {
    onSelectFont(entry);
    setIsOpen(false);
    ensureFontEntryLoaded(entry)
      .then(() => {
        onFontLoaded?.();
      })
      .catch(() => {
        onFontLoaded?.();
      });
  };

  const handleAiMatchCinemaFont = async () => {
    if (!trimmedQuery || isAiMatchingFont) return;
    setIsAiMatchingFont(true);
    try {
      const matchedEntry = await matchCinemaFontWithAI(trimmedQuery);
      onSelectFont(matchedEntry);
      onFontLoaded?.();
      onNotify?.(
        `✨ Gemini подобрал «${matchedEntry.primaryFamily}» (как в «${matchedEntry.title}») и применил на холст!`,
        'success'
      );
      setActiveTab('film_game');
      setSearchQuery('');
      setIsOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Не удалось подобрать шрифт через Gemini AI.';
      onNotify?.(msg, 'error');
    } finally {
      setIsAiMatchingFont(false);
    }
  };

  const handleUploadCustomFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingFont(true);
    try {
      const entry = await registerCustomFontFile(file);
      onSelectFont(entry);
      onFontLoaded?.();
      onNotify?.(`✅ Свой шрифт «${entry.title}» загружен и применён!`, 'success');
      setIsOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить файл шрифта';
      onNotify?.(msg, 'error');
    } finally {
      setIsUploadingFont(false);
    }
  };

  const accentBorder =
    accentTone === 'cyan'
      ? 'border-cyan-400/50 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
      : 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]';

  const activeTabBg =
    accentTone === 'cyan'
      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/45'
      : 'bg-amber-500/20 text-[#FDE047] border-amber-400/45';

  const selectedBadgePill =
    selectedEntry.source === 'custom'
      ? '📁 Custom'
      : selectedEntry.isAiMatched
        ? '✨ AI Кино'
        : selectedEntry.source === 'film_game'
          ? '🎬 Кино/Игры'
          : '🔤 Google Fonts';

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <span className="text-[10px] text-white/60 uppercase font-semibold tracking-wider block mb-1">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#090D16]/90 border text-left flex items-center justify-between gap-2.5 cursor-pointer transition ${
          isOpen
            ? accentBorder
            : 'border-white/[0.12] hover:border-white/25'
        }`}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
              selectedEntry.source === 'custom'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : selectedEntry.isAiMatched
                  ? 'bg-purple-500/20 border-purple-400/45 text-purple-200'
                  : selectedEntry.source === 'film_game'
                    ? 'bg-amber-500/15 border-amber-400/35 text-amber-300'
                    : 'bg-cyan-500/15 border-cyan-400/35 text-cyan-300'
            }`}
          >
            {selectedBadgePill}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-bold text-[#f8fafc] truncate leading-tight"
              style={{ fontFamily: selectedEntry.cssFamily }}
            >
              {selectedEntry.title}
            </div>
            <div className="text-[10px] text-white/50 truncate leading-tight mt-0.5">
              {selectedEntry.referenceFont
                ? `Ref: ${selectedEntry.referenceFont} → ${selectedEntry.equivalentLabel}`
                : selectedEntry.equivalentLabel}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-white/60 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-300' : ''
          }`}
        />
      </button>

      {/* Compact CapCut-Style Dropdown Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            className={`absolute z-50 mt-1.5 w-full min-w-0 sm:min-w-[300px] rounded-2xl bg-[#0B101C]/95 backdrop-blur-xl border border-white/[0.14] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.9)] overflow-hidden ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {/* Header: Quick Search + Compact 2-Tab Source Switcher */}
            <div className="p-2.5 border-b border-white/[0.08] bg-[#090D16]/85 space-y-2">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-white/45 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && showAiMatcherCta && filteredTabFonts.length === 0) {
                      e.preventDefault();
                      void handleAiMatchCinemaFont();
                    }
                  }}
                  placeholder="Поиск (Дюна, Аркейн, Witcher, Interstellar)..."
                  className="w-full bg-[#131B2E]/90 border border-white/[0.1] focus:border-amber-400/70 rounded-lg pl-8 pr-7 py-1.5 text-xs text-[#f8fafc] placeholder:text-white/40 outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2 text-white/45 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('film_game')}
                  className={`min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeTab === 'film_game'
                      ? activeTabBg
                      : 'bg-[#131B2E]/65 border-white/[0.08] text-white/60 hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3 shrink-0" />
                  <span className="truncate">🎬 Кино / Игры ({allFilmPresets.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('google')}
                  className={`min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeTab === 'google'
                      ? activeTabBg
                      : 'bg-[#131B2E]/65 border-white/[0.08] text-white/60 hover:text-white'
                  }`}
                >
                  <Type className="w-3 h-3 shrink-0" />
                  <span className="truncate">🔤 Google Fonts</span>
                </button>
              </div>
            </div>

            {/* Scrollable Body strictly constrained to max-h-[280px] (6-8 visible items) */}
            <div className="max-h-[280px] overflow-y-auto divide-y divide-white/[0.05]">
              {/* Custom Uploaded Fonts (always immediately visible at the top if present) */}
              {filteredCustomFonts.length > 0 && (
                <div className="bg-emerald-500/[0.04]">
                  <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider text-emerald-300/80 flex items-center gap-1.5 bg-[#090D16]/60">
                    <Sparkles className="w-3 h-3" />
                    <span>Загруженные шрифты ({filteredCustomFonts.length})</span>
                  </div>
                  {filteredCustomFonts.map(entry => {
                    const isSelected = selectedEntry.id === entry.id;
                    return (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectEntry(entry)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectEntry(entry);
                          }
                        }}
                        className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition ${
                          isSelected
                            ? 'bg-emerald-500/15 border-l-2 border-l-emerald-400'
                            : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-bold text-[#f8fafc] truncate"
                            style={{ fontFamily: entry.cssFamily }}
                          >
                            {entry.title}
                          </div>
                          <div className="text-[10px] text-white/50 truncate">
                            {entry.equivalentLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                            {entry.referenceFont || 'CUSTOM'}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active Source Tab Rows */}
              {filteredTabFonts.length > 0 ? (
                <>
                  {filteredTabFonts.map(entry => {
                    const isSelected = selectedEntry.id === entry.id;
                    return (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectEntry(entry)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectEntry(entry);
                          }
                        }}
                        className={`px-3 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition ${
                          isSelected
                            ? accentTone === 'cyan'
                              ? 'bg-cyan-500/15 border-l-2 border-l-cyan-400'
                              : 'bg-amber-500/15 border-l-2 border-l-amber-400'
                            : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[14px] text-[#f8fafc] truncate leading-snug"
                              style={{
                                fontFamily: entry.cssFamily,
                                fontWeight: Number(entry.weight) || 700
                              }}
                            >
                              {entry.title}
                            </span>
                            {entry.isAiMatched && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-500/25 text-purple-200 border border-purple-400/40 shrink-0">
                                AI
                              </span>
                            )}
                          </div>
                          {entry.source === 'film_game' ? (
                            <div className="text-[10px] text-white/45 truncate mt-0.5">
                              Ref: {entry.referenceFont} • {entry.equivalentLabel}
                            </div>
                          ) : (
                            <div className="text-[10px] text-white/45 truncate mt-0.5">
                              {entry.equivalentLabel}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {entry.source === 'film_game' && (
                            <a
                              href={entry.fontInLogoUrl || 'https://fontinlogo.com'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Открыть референсы Font in Logo в новой вкладке"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] hover:bg-amber-500/20 border border-white/[0.1] hover:border-amber-400/40 text-[9px] font-mono text-white/70 hover:text-amber-200 transition"
                            >
                              <span>↗ FontInLogo</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {isSelected && (
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 ${
                                accentTone === 'cyan' ? 'text-cyan-300' : 'text-amber-300'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Secondary AI button if user typed a specific movie/game title with no exact match */}
                  {showAiMatcherCta && (
                    <div className="p-2 bg-purple-500/[0.07]">
                      <button
                        type="button"
                        disabled={isAiMatchingFont}
                        onClick={() => void handleAiMatchCinemaFont()}
                        className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/20 via-amber-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 border border-purple-400/40 text-xs font-bold text-amber-100 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
                      >
                        {isAiMatchingFont ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
                            <span>Подбираем шрифт через Gemini AI...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                            <span className="truncate">
                              ✨ Подобрать шрифт как в «{trimmedQuery}» через ИИ
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-3.5 py-5 text-center space-y-2.5">
                  <p className="text-xs text-white/60">
                    «{trimmedQuery}» не найдено в готовом списке.
                  </p>
                  {normalizedQuery.length >= 2 && (
                    <button
                      type="button"
                      disabled={isAiMatchingFont}
                      onClick={() => void handleAiMatchCinemaFont()}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-gradient-to-r from-purple-500/25 via-amber-500/25 to-cyan-500/25 hover:from-purple-500/35 hover:to-cyan-500/35 border border-amber-400/50 text-xs font-bold text-[#FDE047] flex items-center justify-center gap-2 cursor-pointer transition shadow-lg disabled:opacity-60"
                    >
                      {isAiMatchingFont ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
                          <span>Gemini подбирает Google Font...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                          <span>✨ Подобрать шрифт как в «{trimmedQuery}» через ИИ</span>
                        </>
                      )}
                    </button>
                  )}
                  {otherTabMatchCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab(prev => (prev === 'film_game' ? 'google' : 'film_game'))
                      }
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-white/80 text-[11px] font-semibold cursor-pointer hover:bg-white/[0.12] transition"
                    >
                      Или показать совпадения во 2-й вкладке ({otherTabMatchCount}) →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Bottom Footer: Upload Custom Font (.ttf / .otf / .woff2) */}
            <div className="p-2 border-t border-white/[0.08] bg-[#090D16]/95">
              <input
                ref={fontFileInputRef}
                type="file"
                accept=".ttf,.otf,.woff2,.woff"
                onChange={handleUploadCustomFont}
                className="sr-only"
              />
              <button
                type="button"
                disabled={isUploadingFont}
                onClick={() => fontFileInputRef.current?.click()}
                className="w-full min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-amber-500/15 border border-white/[0.12] hover:border-amber-400/45 text-[11px] font-bold text-[#f8fafc] hover:text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {isUploadingFont
                    ? 'Регистрация шрифта...'
                    : '➕ Загрузить свой шрифт (.ttf / .otf / .woff2)'}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
