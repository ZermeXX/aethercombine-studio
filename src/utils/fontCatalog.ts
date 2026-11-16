/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export type FontSourceCategory = 'film_game' | 'google' | 'custom';

export interface StudioFontEntry {
  id: string;
  source: FontSourceCategory;
  /** Primary visible title (e.g. movie/game title or font name) */
  title: string;
  /** Subtitle / Font in Logo original reference or usage description */
  referenceFont?: string;
  /** CSS font-family stack used on Canvas & SVG */
  cssFamily: string;
  /** Exact Google Font or Custom FontFace family name used for loading */
  primaryFamily: string;
  /** Optional secondary Google Font family for Cyrillic coverage */
  secondaryFamily?: string;
  /** Preferred canvas font weight */
  weight: string;
  /** Keywords used by quick search */
  searchKeywords: string;
  /** Base64 data URL if uploaded manually (.ttf / .otf / .woff2) */
  dataUrl?: string;
  /** Suggested Font in Logo query */
  fontInLogoUrl?: string;
  /** Hint for decorative badge/summary */
  equivalentLabel: string;
  /** Marks AI-matched entries generated via Gemini */
  isAiMatched?: boolean;
}

export const FILM_GAME_FONT_PRESETS: StudioFontEntry[] = [
  {
    id: 'film_lotr',
    source: 'film_game',
    title: 'Властелин колец / Lord of the Rings',
    referenceFont: 'Ringbearer / Aniron',
    equivalentLabel: 'Cinzel Decorative',
    cssFamily: '"Cinzel Decorative", "Cormorant Garamond", Georgia, serif',
    primaryFamily: 'Cinzel Decorative',
    secondaryFamily: 'Cormorant Garamond',
    weight: '900',
    searchKeywords: 'властелин колец lord of the rings lotr хоббит hobbit ringbearer aniron cinzel decorative фэнтези толкин',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_harry_potter',
    source: 'film_game',
    title: 'Гарри Поттер / Harry Potter',
    referenceFont: 'Lumos / Garamond',
    equivalentLabel: 'Crimson Pro / EB Garamond',
    cssFamily: '"Crimson Pro", "EB Garamond", Georgia, serif',
    primaryFamily: 'Crimson Pro',
    secondaryFamily: 'EB Garamond',
    weight: '700',
    searchKeywords: 'гарри поттер harry potter хогвартс hogwarts lumos garamond crimson pro eb garamond магия фэнтези',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_dune_blade_runner',
    source: 'film_game',
    title: 'Дюна / Dune',
    referenceFont: 'Albertus / Orthos',
    equivalentLabel: 'Cinzel',
    cssFamily: '"Cinzel", "Forum", Georgia, serif',
    primaryFamily: 'Cinzel',
    secondaryFamily: 'Forum',
    weight: '800',
    searchKeywords: 'дюна dune бегущий по лезвию blade runner albertus orthos benguiat cinzel sci-fi кино',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_the_witcher',
    source: 'film_game',
    title: 'Ведьмак / The Witcher',
    referenceFont: 'Mason Serif',
    equivalentLabel: 'Uncial Antiqua',
    cssFamily: '"Uncial Antiqua", "Forum", Georgia, serif',
    primaryFamily: 'Uncial Antiqua',
    secondaryFamily: 'Forum',
    weight: '700',
    searchKeywords: 'ведьмак the witcher геральт geralt mason serif uncial antiqua forum игра сериал фэнтези',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_oppenheimer_chernobyl',
    source: 'film_game',
    title: 'Оппенгеймер / Чернобыль (HBO)',
    referenceFont: 'Gotham / Helvetica',
    equivalentLabel: 'Montserrat',
    cssFamily: '"Montserrat", "Inter", sans-serif',
    primaryFamily: 'Montserrat',
    secondaryFamily: 'Inter',
    weight: '900',
    searchKeywords: 'оппенгеймер oppenheimer чернобыль chernobyl hbo gotham helvetica montserrat inter кино драма',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_peaky_blinders',
    source: 'film_game',
    title: 'Острые козырьки / Peaky Blinders',
    referenceFont: 'Baskerville',
    equivalentLabel: 'Playfair Display',
    cssFamily: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    primaryFamily: 'Playfair Display',
    secondaryFamily: 'Cormorant Garamond',
    weight: '800',
    searchKeywords: 'острые козырьки peaky blinders томас шелби baskerville roman playfair display cormorant сериал',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_stranger_things',
    source: 'film_game',
    title: 'Очень странные дела / Stranger Things',
    referenceFont: 'ITC Benguiat',
    equivalentLabel: 'Libre Baskerville',
    cssFamily: '"Libre Baskerville", "EB Garamond", Georgia, serif',
    primaryFamily: 'Libre Baskerville',
    secondaryFamily: 'EB Garamond',
    weight: '700',
    searchKeywords: 'очень странные дела stranger things itc benguiat libre baskerville eb garamond сериал 80s',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_god_of_war',
    source: 'film_game',
    title: 'God of War / Викинги',
    referenceFont: 'Berserker / Trajan',
    equivalentLabel: 'Marcellus',
    cssFamily: '"Marcellus", "Philosopher", Georgia, serif',
    primaryFamily: 'Marcellus',
    secondaryFamily: 'Philosopher',
    weight: '700',
    searchKeywords: 'god of war кратос викинги vikings berserker trajan marcellus philosopher игра эпос',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_cyberpunk_scifi',
    source: 'film_game',
    title: 'Киберпанк / Бегущий по лезвию',
    referenceFont: 'Blender Pro / Eurostile',
    equivalentLabel: 'Orbitron',
    cssFamily: '"Orbitron", "Russo One", sans-serif',
    primaryFamily: 'Orbitron',
    secondaryFamily: 'Russo One',
    weight: '800',
    searchKeywords: 'киберпанк cyberpunk 2077 бегущий по лезвию blade runner sci-fi blender pro eurostile orbitron игра',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_bbc_netflix_doc',
    source: 'film_game',
    title: 'BBC / Netflix Documentary',
    referenceFont: 'Bebas / Futura',
    equivalentLabel: 'Bebas Neue',
    cssFamily: '"Bebas Neue", "Oswald", sans-serif',
    primaryFamily: 'Bebas Neue',
    secondaryFamily: 'Oswald',
    weight: '700',
    searchKeywords: 'bbc netflix documentary документальный futura bebas neue oswald сериал',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_game_of_thrones',
    source: 'film_game',
    title: 'Игра престолов / Game of Thrones',
    referenceFont: 'Trajan Pro',
    equivalentLabel: 'Cormorant Garamond',
    cssFamily: '"Cormorant Garamond", "Cinzel", Georgia, serif',
    primaryFamily: 'Cormorant Garamond',
    secondaryFamily: 'Cinzel',
    weight: '700',
    searchKeywords: 'игра престолов game of thrones дом дракона house of the dragon trajan pro cormorant garamond сериал',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_archive_xfiles',
    source: 'film_game',
    title: 'Секретные материалы / Архив',
    referenceFont: 'Courier / Typewriter',
    equivalentLabel: 'Special Elite',
    cssFamily: '"Special Elite", "JetBrains Mono", monospace',
    primaryFamily: 'Special Elite',
    secondaryFamily: 'JetBrains Mono',
    weight: '400',
    searchKeywords: 'секретные материалы x-files архив досье расследование тру крайм courier typewriter special elite jetbrains mono',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_interstellar',
    source: 'film_game',
    title: 'Интерстеллар / Interstellar',
    referenceFont: 'Futura Light / Avenir',
    equivalentLabel: 'Space Grotesk',
    cssFamily: '"Space Grotesk", "Montserrat", sans-serif',
    primaryFamily: 'Space Grotesk',
    secondaryFamily: 'Montserrat',
    weight: '700',
    searchKeywords: 'интерстеллар interstellar космос нолан nolan futura space grotesk фантастика',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_arcane',
    source: 'film_game',
    title: 'Аркейн / Arcane (League of Legends)',
    referenceFont: 'Beaufort for LoL',
    equivalentLabel: 'Philosopher',
    cssFamily: '"Philosopher", "Cinzel", Georgia, serif',
    primaryFamily: 'Philosopher',
    secondaryFamily: 'Cinzel',
    weight: '700',
    searchKeywords: 'аркейн arcane league of legends lol джинкс jinx пилтовер beaufort philosopher сериал анимация',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_sherlock',
    source: 'film_game',
    title: 'Шерлок / Sherlock (BBC)',
    referenceFont: 'Bodoni / P22 Johnston',
    equivalentLabel: 'Bodoni Moda',
    cssFamily: '"Bodoni Moda", "Playfair Display", Georgia, serif',
    primaryFamily: 'Bodoni Moda',
    secondaryFamily: 'Playfair Display',
    weight: '700',
    searchKeywords: 'шерлок sherlock холмс holmes bbc детектив bodoni moda playfair display сериал',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_matrix',
    source: 'film_game',
    title: 'Матрица / The Matrix',
    referenceFont: 'Miltown / OCR-A',
    equivalentLabel: 'Share Tech Mono',
    cssFamily: '"Share Tech Mono", "JetBrains Mono", monospace',
    primaryFamily: 'Share Tech Mono',
    secondaryFamily: 'JetBrains Mono',
    weight: '400',
    searchKeywords: 'матрица matrix нео neo код терминал share tech mono jetbrains mono sci-fi',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_dark_knight',
    source: 'film_game',
    title: 'Темный рыцарь / Бэтмен',
    referenceFont: 'Tungsten / Gotham Condensed',
    equivalentLabel: 'Oswald',
    cssFamily: '"Oswald", "Barlow Condensed", sans-serif',
    primaryFamily: 'Oswald',
    secondaryFamily: 'Barlow Condensed',
    weight: '700',
    searchKeywords: 'темный рыцарь dark knight бэтмен batman готэм oswald barlow condensed кино боевик',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_godfather_mafia',
    source: 'film_game',
    title: 'Крёстный отец / Mafia',
    referenceFont: 'Corleone / Bodoni Poster',
    equivalentLabel: 'Abril Fatface',
    cssFamily: '"Abril Fatface", "Playfair Display", Georgia, serif',
    primaryFamily: 'Abril Fatface',
    secondaryFamily: 'Playfair Display',
    weight: '400',
    searchKeywords: 'крестный отец крёстный отец godfather mafia мафия corleone abril fatface playfair',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_back_to_future',
    source: 'film_game',
    title: 'Назад в будущее / Synthwave 80s',
    referenceFont: 'Back to the Future / Outrun',
    equivalentLabel: 'Righteous',
    cssFamily: '"Righteous", "Russo One", sans-serif',
    primaryFamily: 'Righteous',
    secondaryFamily: 'Russo One',
    weight: '400',
    searchKeywords: 'назад в будущее back to the future synthwave 80s ретровейв outrun righteous russo one',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_last_of_us',
    source: 'film_game',
    title: 'Одни из нас / The Last of Us',
    referenceFont: 'DIN Condensed / Press',
    equivalentLabel: 'Anton',
    cssFamily: '"Anton", "Oswald", sans-serif',
    primaryFamily: 'Anton',
    secondaryFamily: 'Oswald',
    weight: '400',
    searchKeywords: 'одни из нас the last of us tlou постапокалипсис anton oswald игра сериал hbo',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_skyrim_elderscrolls',
    source: 'film_game',
    title: 'Скайрим / The Elder Scrolls',
    referenceFont: 'Planewalker / Futura Condensed',
    equivalentLabel: 'Forum',
    cssFamily: '"Forum", "Cinzel", Georgia, serif',
    primaryFamily: 'Forum',
    secondaryFamily: 'Cinzel',
    weight: '400',
    searchKeywords: 'скайрим skyrim elder scrolls oblivion довакин forum cinzel игра рпг',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_red_dead',
    source: 'film_game',
    title: 'Red Dead Redemption / Вестерн',
    referenceFont: 'Chinese Rocks',
    equivalentLabel: 'Rye',
    cssFamily: '"Rye", "Russo One", serif',
    primaryFamily: 'Rye',
    secondaryFamily: 'Russo One',
    weight: '400',
    searchKeywords: 'red dead redemption rdr2 дикий запад вестерн western chinese rocks rye играть',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_breaking_bad',
    source: 'film_game',
    title: 'Во все тяжкие / Breaking Bad',
    referenceFont: 'Helvetica Black / Cooper',
    equivalentLabel: 'Barlow Condensed',
    cssFamily: '"Barlow Condensed", "Oswald", sans-serif',
    primaryFamily: 'Barlow Condensed',
    secondaryFamily: 'Oswald',
    weight: '800',
    searchKeywords: 'во все тяжкие breaking bad хайзенберг сериал barlow condensed oswald',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_death_note',
    source: 'film_game',
    title: 'Тетрадь смерти / Death Note',
    referenceFont: 'Cloister Black / Old English',
    equivalentLabel: 'UnifrakturMaguntia',
    cssFamily: '"UnifrakturMaguntia", "Cormorant Garamond", serif',
    primaryFamily: 'UnifrakturMaguntia',
    secondaryFamily: 'Cormorant Garamond',
    weight: '400',
    searchKeywords: 'тетрадь смерти death note аниме готика готический anime cloister unifraktur',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_joker',
    source: 'film_game',
    title: 'Джокер / Психологический триллер',
    referenceFont: 'Compacta / Impact Condensed',
    equivalentLabel: 'Teko',
    cssFamily: '"Teko", "Oswald", sans-serif',
    primaryFamily: 'Teko',
    secondaryFamily: 'Oswald',
    weight: '700',
    searchKeywords: 'джокер joker триллер постер плакат teko oswald драма кино',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_star_wars',
    source: 'film_game',
    title: 'Звёздные войны / Star Wars',
    referenceFont: 'News Gothic / Star Jedi',
    equivalentLabel: 'Russo One',
    cssFamily: '"Russo One", "Montserrat", sans-serif',
    primaryFamily: 'Russo One',
    weight: '400',
    searchKeywords: 'звездные войны звёздные войны star wars мандалорец jedi ситх russo one',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_cosmos_nasa',
    source: 'film_game',
    title: 'Гравитация / Космос (NASA)',
    referenceFont: 'Nasalization / Europa Grotesk',
    equivalentLabel: 'Exo 2',
    cssFamily: '"Exo 2", "Orbitron", sans-serif',
    primaryFamily: 'Exo 2',
    secondaryFamily: 'Orbitron',
    weight: '800',
    searchKeywords: 'гравитация gravity космос space nasa экзопланета exo 2 orbitron научпоп документалка',
    fontInLogoUrl: 'https://fontinlogo.com'
  },
  {
    id: 'film_queens_gambit',
    source: 'film_game',
    title: 'Ход королевы / Историческая драма',
    referenceFont: 'Didot / Tiffany',
    equivalentLabel: 'Cormorant Infant',
    cssFamily: '"Cormorant Infant", "Playfair Display", Georgia, serif',
    primaryFamily: 'Cormorant Infant',
    secondaryFamily: 'Playfair Display',
    weight: '700',
    searchKeywords: 'ход королевы queens gambit корона crown история драма didot cormorant infant',
    fontInLogoUrl: 'https://fontinlogo.com'
  }
];

export const GOOGLE_FONT_PRESETS: StudioFontEntry[] = [
  {
    id: 'gg_montserrat',
    source: 'google',
    title: 'Montserrat',
    equivalentLabel: 'Жирный кинематографичный гротеск',
    cssFamily: '"Montserrat", "Inter", sans-serif',
    primaryFamily: 'Montserrat',
    weight: '900',
    searchKeywords: 'montserrat гротеск youtube превью заголовок'
  },
  {
    id: 'gg_cinzel',
    source: 'google',
    title: 'Cinzel',
    equivalentLabel: 'Монументальная римская антиква',
    cssFamily: '"Cinzel", Georgia, serif',
    primaryFamily: 'Cinzel',
    weight: '800',
    searchKeywords: 'cinzel эпичный антиква траян золото история'
  },
  {
    id: 'gg_cinzel_decorative',
    source: 'google',
    title: 'Cinzel Decorative',
    equivalentLabel: 'Королевские засечки с виньетками',
    cssFamily: '"Cinzel Decorative", "Cinzel", Georgia, serif',
    primaryFamily: 'Cinzel Decorative',
    weight: '900',
    searchKeywords: 'cinzel decorative королевский фэнтези лавры властелин колец'
  },
  {
    id: 'gg_bebas_neue',
    source: 'google',
    title: 'Bebas Neue',
    equivalentLabel: 'Высокий плакатный YouTube-шрифт',
    cssFamily: '"Bebas Neue", "Oswald", sans-serif',
    primaryFamily: 'Bebas Neue',
    secondaryFamily: 'Oswald',
    weight: '700',
    searchKeywords: 'bebas neue плакат постер высокий netflix'
  },
  {
    id: 'gg_oswald',
    source: 'google',
    title: 'Oswald',
    equivalentLabel: 'Узкий документальный заголовок (RU/EN)',
    cssFamily: '"Oswald", sans-serif',
    primaryFamily: 'Oswald',
    weight: '700',
    searchKeywords: 'oswald документальный кириллица заголовки'
  },
  {
    id: 'gg_cormorant',
    source: 'google',
    title: 'Cormorant Garamond',
    equivalentLabel: 'Благородный книжно-исторический (RU/EN)',
    cssFamily: '"Cormorant Garamond", Georgia, serif',
    primaryFamily: 'Cormorant Garamond',
    weight: '700',
    searchKeywords: 'cormorant garamond исторический книжный средневековый игра престолов'
  },
  {
    id: 'gg_playfair',
    source: 'google',
    title: 'Playfair Display',
    equivalentLabel: 'Контрастный журнальный антиквенный (RU/EN)',
    cssFamily: '"Playfair Display", Georgia, serif',
    primaryFamily: 'Playfair Display',
    weight: '800',
    searchKeywords: 'playfair display глянец викторианский драма острые козырьки'
  },
  {
    id: 'gg_crimson_pro',
    source: 'google',
    title: 'Crimson Pro',
    equivalentLabel: 'Литературная магическая антиква',
    cssFamily: '"Crimson Pro", "EB Garamond", Georgia, serif',
    primaryFamily: 'Crimson Pro',
    secondaryFamily: 'EB Garamond',
    weight: '700',
    searchKeywords: 'crimson pro гарри поттер книга фэнтези антиква'
  },
  {
    id: 'gg_eb_garamond',
    source: 'google',
    title: 'EB Garamond',
    equivalentLabel: 'Классическая печатная антиква (RU/EN)',
    cssFamily: '"EB Garamond", Georgia, serif',
    primaryFamily: 'EB Garamond',
    weight: '700',
    searchKeywords: 'eb garamond архив хроника книга'
  },
  {
    id: 'gg_libre_baskerville',
    source: 'google',
    title: 'Libre Baskerville',
    equivalentLabel: 'Выразительный журнальный Baskerville',
    cssFamily: '"Libre Baskerville", "EB Garamond", Georgia, serif',
    primaryFamily: 'Libre Baskerville',
    secondaryFamily: 'EB Garamond',
    weight: '700',
    searchKeywords: 'libre baskerville benguiat тайна триллер'
  },
  {
    id: 'gg_uncial_antiqua',
    source: 'google',
    title: 'Uncial Antiqua',
    equivalentLabel: 'Рунический / фэнтези-манускрипт',
    cssFamily: '"Uncial Antiqua", "Forum", Georgia, serif',
    primaryFamily: 'Uncial Antiqua',
    secondaryFamily: 'Forum',
    weight: '700',
    searchKeywords: 'uncial antiqua ведьмак масон руны фэнтези'
  },
  {
    id: 'gg_forum',
    source: 'google',
    title: 'Forum',
    equivalentLabel: 'Античные резные формы (RU/EN)',
    cssFamily: '"Forum", Georgia, serif',
    primaryFamily: 'Forum',
    weight: '700',
    searchKeywords: 'forum античность ведьмак скайрим кириллица засечки'
  },
  {
    id: 'gg_marcellus',
    source: 'google',
    title: 'Marcellus',
    equivalentLabel: 'Эпичный наклонный Trajan-стиль',
    cssFamily: '"Marcellus", "Philosopher", Georgia, serif',
    primaryFamily: 'Marcellus',
    secondaryFamily: 'Philosopher',
    weight: '700',
    searchKeywords: 'marcellus бог войны викинги эпос'
  },
  {
    id: 'gg_philosopher',
    source: 'google',
    title: 'Philosopher',
    equivalentLabel: 'Острый геометричный антикв (RU/EN)',
    cssFamily: '"Philosopher", Georgia, serif',
    primaryFamily: 'Philosopher',
    weight: '700',
    searchKeywords: 'philosopher мифы викинги аркейн кириллица'
  },
  {
    id: 'gg_orbitron',
    source: 'google',
    title: 'Orbitron',
    equivalentLabel: 'Футуристичный Sci-Fi дисплей',
    cssFamily: '"Orbitron", "Russo One", sans-serif',
    primaryFamily: 'Orbitron',
    secondaryFamily: 'Russo One',
    weight: '800',
    searchKeywords: 'orbitron киберпанк космос неон sci-fi'
  },
  {
    id: 'gg_exo_2',
    source: 'google',
    title: 'Exo 2',
    equivalentLabel: 'Космический научпоп-гротеск (RU/EN)',
    cssFamily: '"Exo 2", sans-serif',
    primaryFamily: 'Exo 2',
    weight: '800',
    searchKeywords: 'exo 2 космос технологии sci-fi кириллица'
  },
  {
    id: 'gg_space_grotesk',
    source: 'google',
    title: 'Space Grotesk',
    equivalentLabel: 'Техно-гротеск для схем и HUD',
    cssFamily: '"Space Grotesk", "Inter", sans-serif',
    primaryFamily: 'Space Grotesk',
    secondaryFamily: 'Inter',
    weight: '700',
    searchKeywords: 'space grotesk техно расследование интерфейс'
  },
  {
    id: 'gg_jetbrains_mono',
    source: 'google',
    title: 'JetBrains Mono',
    equivalentLabel: 'Моноширинный архив / таймкоды (RU/EN)',
    cssFamily: '"JetBrains Mono", monospace',
    primaryFamily: 'JetBrains Mono',
    weight: '700',
    searchKeywords: 'jetbrains mono моноширинный архив досье код'
  },
  {
    id: 'gg_special_elite',
    source: 'google',
    title: 'Special Elite',
    equivalentLabel: 'Гранж-печатная машинка (секретные файлы)',
    cssFamily: '"Special Elite", "JetBrains Mono", monospace',
    primaryFamily: 'Special Elite',
    secondaryFamily: 'JetBrains Mono',
    weight: '400',
    searchKeywords: 'special elite печатная машинка тру крайм досье'
  },
  {
    id: 'gg_russo_one',
    source: 'google',
    title: 'Russo One',
    equivalentLabel: 'Массивный ударный гротеск (RU/EN)',
    cssFamily: '"Russo One", "Montserrat", sans-serif',
    primaryFamily: 'Russo One',
    weight: '400',
    searchKeywords: 'russo one жирный крупный кириллица постер'
  },
  {
    id: 'gg_rubik',
    source: 'google',
    title: 'Rubik',
    equivalentLabel: 'Чёткий современный дисплей (RU/EN)',
    cssFamily: '"Rubik", "Inter", sans-serif',
    primaryFamily: 'Rubik',
    weight: '800',
    searchKeywords: 'rubik современный инфографика youtube'
  },
  {
    id: 'gg_inter',
    source: 'google',
    title: 'Inter',
    equivalentLabel: 'Нейтральный UI и бейджи (RU/EN)',
    cssFamily: '"Inter", sans-serif',
    primaryFamily: 'Inter',
    weight: '800',
    searchKeywords: 'inter минимал чистый интерфейс'
  }
];

// Shared reactive stores for custom uploaded fonts & Gemini AI-matched cinema fonts
let customUploadedFontsStore: StudioFontEntry[] = [];
let aiMatchedFontsStore: StudioFontEntry[] = [];
const customFontListeners = new Set<() => void>();
const aiFontListeners = new Set<() => void>();

function notifyCustomFontListeners(): void {
  customFontListeners.forEach(fn => fn());
}

function notifyAiFontListeners(): void {
  aiFontListeners.forEach(fn => fn());
}

export function getCustomUploadedFonts(): StudioFontEntry[] {
  return customUploadedFontsStore;
}

export function getAiMatchedFonts(): StudioFontEntry[] {
  return aiMatchedFontsStore;
}

export function useCustomUploadedFonts(): StudioFontEntry[] {
  const [fonts, setFonts] = useState<StudioFontEntry[]>(customUploadedFontsStore);

  useEffect(() => {
    const sync = () => setFonts([...customUploadedFontsStore]);
    customFontListeners.add(sync);
    return () => {
      customFontListeners.delete(sync);
    };
  }, []);

  return fonts;
}

export function useAiMatchedFonts(): StudioFontEntry[] {
  const [fonts, setFonts] = useState<StudioFontEntry[]>(aiMatchedFontsStore);

  useEffect(() => {
    const sync = () => setFonts([...aiMatchedFontsStore]);
    aiFontListeners.add(sync);
    return () => {
      aiFontListeners.delete(sync);
    };
  }, []);

  return fonts;
}

const loadedGoogleFontCache = new Set<string>();

/**
 * Dynamically injects a Google Fonts <link> stylesheet if needed and waits for document.fonts
 * to finish loading weights so HTML5 Canvas / SVG renders the exact typeface right away.
 */
export async function loadGoogleFontDynamically(
  family: string,
  preferredWeight: string = '700'
): Promise<void> {
  const cleanFamily = family.replace(/["']/g, '').trim();
  if (!cleanFamily || typeof document === 'undefined') return;

  if (!loadedGoogleFontCache.has(cleanFamily)) {
    const plusFamily = encodeURIComponent(cleanFamily).replace(/%20/g, '+');
    const existingLink = document.querySelector<HTMLLinkElement>(
      `link[data-aether-gfont="${cleanFamily}"]`
    );

    if (!existingLink) {
      await new Promise<void>(resolve => {
        const tryInjectLink = (href: string, allowFallback: boolean) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.setAttribute('data-aether-gfont', cleanFamily);
          link.onload = () => resolve();
          link.onerror = () => {
            link.remove();
            if (allowFallback) {
              // Some display Google Fonts only exist in regular 400 and return 400 on :wght@400;600;700;800;900
              tryInjectLink(
                `https://fonts.googleapis.com/css2?family=${plusFamily}&display=swap`,
                false
              );
            } else {
              resolve();
            }
          };
          document.head.appendChild(link);
        };

        tryInjectLink(
          `https://fonts.googleapis.com/css2?family=${plusFamily}:wght@400;600;700;800;900&display=swap`,
          true
        );
      });
    }
    loadedGoogleFontCache.add(cleanFamily);
  }

  if ('fonts' in document) {
    const weightsToTry = Array.from(new Set([preferredWeight || '700', '700', '400']));
    await Promise.allSettled(
      weightsToTry.map(w => document.fonts.load(`${w} 48px "${cleanFamily}"`))
    );
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }
}

export async function ensureFontEntryLoaded(entry: StudioFontEntry): Promise<void> {
  if (entry.source === 'custom') {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await Promise.allSettled([
        document.fonts.load(`${entry.weight || '700'} 48px "${entry.primaryFamily}"`),
        document.fonts.load(`48px "${entry.primaryFamily}"`)
      ]);
    }
    return;
  }

  const jobs: Promise<void>[] = [
    loadGoogleFontDynamically(entry.primaryFamily, entry.weight)
  ];
  if (entry.secondaryFamily && entry.secondaryFamily !== entry.primaryFamily) {
    jobs.push(loadGoogleFontDynamically(entry.secondaryFamily, entry.weight));
  }
  await Promise.allSettled(jobs);
}

export async function preloadCatalogFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const pairs = new Map<string, string>();
  const addPair = (fam: string | undefined, w: string) => {
    if (!fam) return;
    if (!pairs.has(fam)) pairs.set(fam, w);
  };

  [...FILM_GAME_FONT_PRESETS, ...GOOGLE_FONT_PRESETS].forEach(f => {
    addPair(f.primaryFamily, f.weight);
    if (f.secondaryFamily) addPair(f.secondaryFamily, f.weight);
  });

  await Promise.allSettled(
    Array.from(pairs.entries()).map(([fam, w]) =>
      Promise.allSettled([
        document.fonts.load(`${w} 48px "${fam}"`),
        document.fonts.load(`48px "${fam}"`)
      ])
    )
  );
}

interface GeminiFontMatchResponse {
  matchedTitle: string;
  referenceTypeface: string;
  fontFamily: string;
  fallbackCyrillicFamily: string;
  weight: string;
  categoryFallback: string;
  typographyMood: string;
}

/**
 * Calls server-side Gemini AI (/api/gemini/match-font) for any user-typed movie/series/game title,
 * dynamically loads the returned Google Font into <head>, registers it in the Cinema catalog,
 * and returns the ready-to-apply StudioFontEntry.
 */
export async function matchCinemaFontWithAI(query: string): Promise<StudioFontEntry> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('Введите название фильма, сериала или игры');
  }

  const resp = await fetch('/api/gemini/match-font', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: cleanQuery })
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: GeminiFontMatchResponse;
  };

  if (!resp.ok || !payload.ok || !payload.data?.fontFamily) {
    throw new Error(
      payload.error || `Не удалось подобрать шрифт через Gemini AI (HTTP ${resp.status})`
    );
  }

  const data = payload.data;
  const primaryFam = data.fontFamily.replace(/["']/g, '').trim() || 'Montserrat';
  const fallbackCyr = (data.fallbackCyrillicFamily || 'Montserrat').replace(/["']/g, '').trim();
  const genericFallback = ['serif', 'sans-serif', 'monospace'].includes(data.categoryFallback)
    ? data.categoryFallback
    : 'sans-serif';
  const cleanWeight = /^(400|500|600|700|800|900)$/.test(String(data.weight || '').trim())
    ? String(data.weight).trim()
    : '700';

  await Promise.allSettled([
    loadGoogleFontDynamically(primaryFam, cleanWeight),
    fallbackCyr !== primaryFam
      ? loadGoogleFontDynamically(fallbackCyr, cleanWeight)
      : Promise.resolve()
  ]);

  const cssStack =
    fallbackCyr && fallbackCyr !== primaryFam
      ? `"${primaryFam}", "${fallbackCyr}", ${genericFallback}`
      : `"${primaryFam}", ${genericFallback}`;

  const entry: StudioFontEntry = {
    id: `ai_film_${primaryFam.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`,
    source: 'film_game',
    title: data.matchedTitle || cleanQuery,
    referenceFont: `${data.referenceTypeface || 'Cinema Style'} (${data.typographyMood || 'AI'})`,
    equivalentLabel: primaryFam,
    cssFamily: cssStack,
    primaryFamily: primaryFam,
    secondaryFamily: fallbackCyr !== primaryFam ? fallbackCyr : undefined,
    weight: cleanWeight,
    searchKeywords: `${cleanQuery.toLowerCase()} ${(data.matchedTitle || '').toLowerCase()} ${primaryFam.toLowerCase()} ${(data.referenceTypeface || '').toLowerCase()} ai`,
    fontInLogoUrl: 'https://fontinlogo.com',
    isAiMatched: true
  };

  aiMatchedFontsStore = [
    entry,
    ...aiMatchedFontsStore.filter(
      item =>
        !(
          item.primaryFamily.toLowerCase() === entry.primaryFamily.toLowerCase() &&
          item.title.toLowerCase() === entry.title.toLowerCase()
        )
    )
  ];
  notifyAiFontListeners();
  return entry;
}

export async function registerCustomFontFile(file: File): Promise<StudioFontEntry> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['ttf', 'otf', 'woff2', 'woff'].includes(ext)) {
    throw new Error('Поддерживаются только шрифты .ttf, .otf, .woff2 (.woff)');
  }

  const cleanBaseName =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Custom Cinema Font';

  const uniqueFamilyName = `AetherCustom_${cleanBaseName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}`;

  const [arrayBuffer, dataUrl] = await Promise.all([
    file.arrayBuffer(),
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл шрифта'));
      reader.readAsDataURL(file);
    })
  ]);

  const face = new FontFace(uniqueFamilyName, arrayBuffer);
  const loadedFace = await face.load();
  document.fonts.add(loadedFace);

  try {
    await document.fonts.load(`48px "${uniqueFamilyName}"`);
  } catch {
    // Non-fatal if browser considers face already ready
  }

  const entry: StudioFontEntry = {
    id: `custom_${uniqueFamilyName}`,
    source: 'custom',
    title: cleanBaseName,
    referenceFont: `Custom (${ext.toUpperCase()})`,
    equivalentLabel: file.name,
    cssFamily: `"${uniqueFamilyName}", "Montserrat", "Inter", sans-serif`,
    primaryFamily: uniqueFamilyName,
    weight: '700',
    searchKeywords: `${cleanBaseName.toLowerCase()} ${file.name.toLowerCase()} custom свой шрифт`,
    dataUrl
  };

  customUploadedFontsStore = [entry, ...customUploadedFontsStore];
  notifyCustomFontListeners();
  return entry;
}
