export type OrientationLockStatus =
  | 'idle'
  | 'unavailable'
  | 'requestingFullscreen'
  | 'fullscreenRejected'
  | 'requestingLock'
  | 'locked'
  | 'lockRejected';

export interface LandscapeState {
  portraitHintVisible: boolean;
  orientationLockAttempted: boolean;
  orientationLockStatus: OrientationLockStatus;
}

const PORTRAIT_HINT_QUERY = '(orientation: portrait) and (pointer: coarse)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

let hintMql: MediaQueryList | null = null;
let hintChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
let portraitHintVisible = false;
let orientationLockAttempted = false;
let orientationLockStatus: OrientationLockStatus = 'idle';
let attemptToken = 0;

function applyPortraitHint(matches: boolean): void {
  portraitHintVisible = matches;
  const hint = document.getElementById('portrait-hint');
  if (hint) {
    hint.hidden = !matches;
  }
}

export function initPortraitHint(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  if (hintMql && hintChangeHandler) {
    hintMql.removeEventListener('change', hintChangeHandler);
  }
  hintMql = window.matchMedia(PORTRAIT_HINT_QUERY);
  applyPortraitHint(hintMql.matches);
  hintChangeHandler = (event: MediaQueryListEvent): void => {
    applyPortraitHint(event.matches);
  };
  hintMql.addEventListener('change', hintChangeHandler);
}

type OrientationWithLock = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

function getOrientationLockFn(): ((orientation: string) => Promise<void>) | undefined {
  if (typeof screen === 'undefined') {
    return undefined;
  }
  const orientation = screen.orientation as OrientationWithLock | undefined;
  return typeof orientation?.lock === 'function' ? orientation.lock : undefined;
}

function attemptLock(enteredFullscreen: boolean, token: number): void {
  if (token !== attemptToken) {
    return;
  }
  const lockFn = getOrientationLockFn();
  if (!lockFn) {
    orientationLockStatus = 'unavailable';
    return;
  }
  orientationLockAttempted = true;
  orientationLockStatus = 'requestingLock';

  const onLockRejected = (): void => {
    if (token !== attemptToken) {
      return;
    }
    orientationLockStatus = 'lockRejected';
    if (
      enteredFullscreen &&
      document.fullscreenElement &&
      typeof document.exitFullscreen === 'function'
    ) {
      try {
        Promise.resolve(document.exitFullscreen()).catch(() => {});
      } catch {
        // Ignore expected fullscreen exit rejection.
      }
    }
  };

  try {
    Promise.resolve(lockFn.call(screen.orientation, 'landscape')).then(
      () => {
        if (token === attemptToken) {
          orientationLockStatus = 'locked';
        }
      },
      onLockRejected,
    );
  } catch {
    onLockRejected();
  }
}

export function requestLandscapeOnStart(): void {
  attemptToken += 1;
  const token = attemptToken;
  orientationLockAttempted = false;
  orientationLockStatus = 'idle';

  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(COARSE_POINTER_QUERY).matches;
  const lockFn = getOrientationLockFn();

  if (!isCoarsePointer || document.visibilityState !== 'visible' || !lockFn) {
    orientationLockStatus = 'unavailable';
    return;
  }

  if (document.fullscreenElement) {
    attemptLock(false, token);
    return;
  }

  const root = document.documentElement;
  if (!document.fullscreenEnabled || !root || typeof root.requestFullscreen !== 'function') {
    orientationLockStatus = 'unavailable';
    return;
  }

  orientationLockStatus = 'requestingFullscreen';
  try {
    Promise.resolve(root.requestFullscreen()).then(
      () => {
        attemptLock(true, token);
      },
      () => {
        if (token === attemptToken) {
          orientationLockStatus = 'fullscreenRejected';
        }
      },
    );
  } catch {
    if (token === attemptToken) {
      orientationLockStatus = 'fullscreenRejected';
    }
  }
}

export function getLandscapeState(): LandscapeState {
  return {
    portraitHintVisible,
    orientationLockAttempted,
    orientationLockStatus,
  };
}
