import type { AdapterConfig } from './types';
import { mockSelectors } from './selector-fallbacks';
import { xSelectors } from './x/selectors';
import { linkedinSelectors } from './linkedin/selectors';
import { blueskySelectors } from './bluesky/selectors';
import { threadsSelectors } from './threads/selectors';
import { facebookSelectors } from './facebook/selectors';
import { instagramSelectors } from './instagram/selectors';
import { tiktokSelectors } from './tiktok/selectors';
import { youtubeSelectors } from './youtube/selectors';
import { pinterestSelectors } from './pinterest/selectors';

export const adapterConfigs: AdapterConfig[] = [
  {
    id: 'mock',
    home: 'http://127.0.0.1:4178',
    compose: 'http://127.0.0.1:4178/compose',
    profile: 'http://127.0.0.1:4178/profile',
    selectors: mockSelectors,
  },
  {
    id: 'x',
    home: 'https://x.com/home',
    compose: 'https://x.com/compose/post',
    profile: 'https://x.com/home',
    profileLink: ['a[data-testid="AppTabBar_Profile_Link"]'],
    permalink: ['a:has(time)', 'a[href*="/status/"]'],
    selectors: xSelectors,
    altText: {
      open: ['[aria-label="Add description"]', '[data-handpost="alt-open"]'],
      input: ['textarea[aria-label*="description"]', '[data-handpost="alt-input"]'],
      save: ['button:has-text("Save")', '[data-handpost="alt-save"]'],
    },
    thread: {
      add: ['[data-testid="addButton"]', '[data-handpost="thread-add"]'],
      text: ['[data-testid^="tweetTextarea_"]', '[data-handpost="thread-text"]'],
    },
    comment: {
      input: ['[data-testid="tweetTextarea_0"]', '[data-handpost="comment-input"]'],
      submit: ['[data-testid="tweetButtonInline"]', '[data-handpost="comment-submit"]'],
    },
  },
  {
    id: 'linkedin',
    home: 'https://www.linkedin.com/feed/',
    compose: 'https://www.linkedin.com/feed/?shareActive=true',
    profile: 'https://www.linkedin.com/in/me/recent-activity/all/',
    selectors: linkedinSelectors,
    comment: {
      input: ['.comments-comment-box__form [contenteditable="true"]', '[data-handpost="comment-input"]'],
      submit: ['button.comments-comment-box__submit-button', '[data-handpost="comment-submit"]'],
    },
  },
  {
    id: 'bluesky',
    home: 'https://bsky.app',
    compose: 'https://bsky.app',
    profile: 'https://bsky.app/profile/me',
    selectors: blueskySelectors,
    altText: {
      open: ['button:has-text("ALT")', '[data-handpost="alt-open"]'],
      input: ['textarea[placeholder*="alt"]', '[data-handpost="alt-input"]'],
      save: ['button:has-text("Save")', '[data-handpost="alt-save"]'],
    },
  },
  {
    id: 'threads',
    home: 'https://www.threads.net',
    compose: 'https://www.threads.net',
    profile: 'https://www.threads.net/@me',
    selectors: threadsSelectors,
    comment: {
      input: ['[contenteditable="true"]', '[data-handpost="comment-input"]'],
      submit: ['div[role="button"]:has-text("Post")', '[data-handpost="comment-submit"]'],
    },
  },
  {
    id: 'facebook',
    home: 'https://www.facebook.com',
    compose: 'https://www.facebook.com',
    profile: 'https://www.facebook.com/me',
    selectors: facebookSelectors,
    optionFields: [
      {
        key: 'pageName',
        label: 'Page identity',
        selectors: ['[aria-label="Page identity"]', '[data-handpost="page-picker"]'],
        required: true,
      },
    ],
    flowSteps: [
      {
        name: 'confirm page identity',
        selectors: ['[aria-label*="Page profile"]', '[data-handpost="flow-step"]'],
      },
    ],
    comment: {
      input: ['[aria-label*="comment"]', '[data-handpost="comment-input"]'],
      submit: ['button:has-text("Comment")', '[data-handpost="comment-submit"]'],
    },
  },
  {
    id: 'instagram',
    home: 'https://www.instagram.com',
    compose: 'https://www.instagram.com',
    profile: 'https://www.instagram.com/accounts/edit/',
    selectors: instagramSelectors,
    processing: true,
    flowSteps: [
      {
        name: 'confirm crop',
        selectors: ['div[role="button"]:has-text("Next")', '[data-handpost="flow-step"]'],
      },
    ],
    altText: {
      open: ['button:has-text("Accessibility")', '[data-handpost="alt-open"]'],
      input: ['textarea[aria-label*="alt text"]', '[data-handpost="alt-input"]'],
      save: ['button:has-text("Done")', '[data-handpost="alt-save"]'],
      afterFlow: true,
    },
    comment: {
      input: ['textarea[aria-label*="comment"]', '[data-handpost="comment-input"]'],
      submit: ['button:has-text("Post")', '[data-handpost="comment-submit"]'],
    },
  },
  {
    id: 'tiktok',
    home: 'https://www.tiktok.com',
    compose: 'https://www.tiktok.com/upload',
    profile: 'https://www.tiktok.com/@me',
    selectors: tiktokSelectors,
    processing: true,
    optionFields: [
      {
        key: 'coverTime',
        label: 'Cover timestamp',
        selectors: ['[data-e2e="cover-time-input"]', '[data-handpost="cover-time"]'],
      },
    ],
    flowSteps: [
      {
        name: 'confirm video cover',
        selectors: ['[data-e2e="video-cover-edit"]', '[data-handpost="flow-step"]'],
      },
    ],
  },
  {
    id: 'youtube',
    home: 'https://studio.youtube.com',
    compose: 'https://studio.youtube.com',
    profile: 'https://studio.youtube.com/channel/UC/videos/short',
    selectors: youtubeSelectors,
    processing: true,
    optionFields: [
      {
        key: 'title',
        label: 'Short title',
        selectors: ['#title-textarea #textbox', '[data-handpost="title"]'],
        required: true,
      },
      {
        key: 'madeForKids',
        label: 'Audience',
        selectors: [
          'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]',
          '[data-handpost="audience-made"]',
        ],
        falseSelectors: [
          'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
          '[data-handpost="audience"]',
        ],
        type: 'toggle',
        required: true,
      },
      {
        key: 'visibility',
        label: 'Visibility',
        selectors: ['select[name="visibility"]', '[data-handpost="visibility"]'],
        type: 'select',
        afterFlow: true,
        required: true,
      },
    ],
    flowSteps: [
      { name: 'continue upload wizard', selectors: ['#next-button', '[data-handpost="flow-step"]'] },
    ],
  },
  {
    id: 'pinterest',
    home: 'https://www.pinterest.com',
    compose: 'https://www.pinterest.com/pin-builder/',
    profile: 'https://www.pinterest.com/me/_created/',
    selectors: pinterestSelectors,
    processing: true,
    optionFields: [
      {
        key: 'title',
        label: 'Pin title',
        selectors: ['[data-test-id="pin-draft-title"]', '[data-handpost="title"]'],
        required: true,
      },
      {
        key: 'destinationUrl',
        label: 'Destination URL',
        selectors: ['[data-test-id="pin-draft-link"]', '[data-handpost="destination"]'],
        required: true,
      },
      {
        key: 'board',
        label: 'Board',
        selectors: ['[data-test-id="board-search-input"]', '[data-handpost="board-search"]'],
        afterFlow: true,
        required: true,
      },
    ],
    flowSteps: [
      {
        name: 'open board picker',
        selectors: ['[data-test-id="board-dropdown-select-button"]', '[data-handpost="flow-step"]'],
      },
      {
        name: 'select board result',
        selectors: ['[data-test-id="board-row"]', '[data-handpost="board-result"]'],
        stage: 'afterOptions',
      },
    ],
  },
];
