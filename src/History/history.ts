enum Action {
  POP = "POP",
  PUSH = "PUSH",
  REPLACE = "REPLACE",
}
interface Path {
  pathname: string;
  search: string;
  hash: string;
}

interface Location extends Path {
  state: unknown;
  key: string;
}

type To = string | Partial<Path>;

export interface Update {
  /**
   * The action that triggered the change.
   */
  action: Action;

  /**
   * The new location.
   */
  location: Location;
}

export interface Listener {
  (update: Update): void;
}

export interface Transition extends Update {
  /**
   * Retries the update to the current location.
   */
  retry(): void;
}

export interface Blocker {
  (tx: Transition): void;
}

type HistoryState = {
  usr: any;
  key?: string;
  idx: number;
};

interface History {
  readonly action: Action;
  readonly location: Location;
  createHref(to: To): string;
  push(to: To, state?: any): void;
  replace(to: To, state?: any): void;
  go(delta: number): void;
  forward(): void;
  back(): void;
  listen(listener: Listener): void;
  block(blocker: Blocker): () => void;
}

const PopStateEventType = "popstate";
const BeforeUnloadEventType = "beforeunload";

interface BrowserHistory extends History {}

export function createBrowserHistory() {
  /** 获取 history 对象 */
  let globalHistory = window.history;

  /** 默认的 action 类型 */
  let action = Action.POP;

  function getIndexAndLocation(): [number, Location] {
    const state = globalHistory.state;
    const { pathname, search, hash } = window.location;

    return [
      state?.idx || null,
      {
        pathname,
        search,
        hash,
        state: state?.usr || null,
        key: state?.key || "default",
      },
    ];
  }

  function getNextLocation(to: To, state: any = null): Location {
    return {
      pathname: "",
      search: "",
      hash: "",
      ...(typeof to === "string" ? parsePath(to) : to),
      state,
      key: createKey(),
    };
  }

  /** 获取当前路由的 索引 和 locaiton */
  let [index, location] = getIndexAndLocation();

  // 索引不存在的时候
  if (index === null) {
    index = 0;
    globalHistory.replaceState({ ...globalHistory.state, idx: index }, "");
  }

  // 监听器
  let listeners = createEvents<Listener>();
  // 监听页面跳转前的回调函数
  let blockers = createEvents<Blocker>();

  function createHref(to: To): string {
    return typeof to === "string" ? to : createPath(to);
  }

  function allowTx(
    action: Action,
    location: Location,
    retry: () => void
  ): boolean {
    return (
      !blockers.length || (blockers.call({ action, location, retry }), false)
    );
  }

  function applyTx(nextAction: Action) {
    action = nextAction;
    [index, location] = getIndexAndLocation();

    listeners.call({ action, location });
  }

  function getHistoryStateAndUrl(
    nextLocaiton: Location,
    index: number
  ): [HistoryState, string] {
    return [
      {
        idx: index,
        key: nextLocaiton.key,
        usr: nextLocaiton.state,
      },
      createHref(nextLocaiton),
    ];
  }

  let blockedPopTx: Transition | null = null;

  /** go、back、forward 触发 popstate 事件时，拦截 */
  function handlePop() {
    console.log("handlePop");

    if (blockedPopTx) {
      blockers.call(blockedPopTx);
      blockedPopTx = null;
    } else {
      let nextAction = Action.POP;
      let [nextIndex, nextLocation] = getIndexAndLocation();
      if (blockers.length) {
        if (nextIndex != null) {
          let delta = index - nextIndex;
          if (delta) {
            // Revert the POP
            blockedPopTx = {
              action: nextAction,
              location: nextLocation,
              retry() {
                go(delta * -1);
              },
            };

            go(delta);
          }
        }
      } else {
        applyTx(nextAction);
      }
    }
  }

  window.addEventListener(PopStateEventType, handlePop);

  function go(delta: number) {
    globalHistory.go(delta);
  }

  /** 是对 history.pushState 的封装，手动触发 监听器 */
  function push(to: To, state?: any) {
    /** 构建即将跳转的 action 和 location */
    let nextAction = Action.PUSH;
    let nextLocation = getNextLocation(to, state);

    function retry() {
      push(to, state);
    }

    /** 判断是否能直接跳转，还是先拦截（用户可能监听了 beforeunload 事件） */
    if (allowTx(nextAction, nextLocation, retry)) {
      /** 获取 state 对象和 url 地址，调用 history.pushState 方法 */
      const [historyState, url] = getHistoryStateAndUrl(
        nextLocation,
        index + 1
      );
      try {
        globalHistory.pushState(historyState, "", url);
      } catch (error) {
        console.log("error", error);
        /** hash 方式  */
        window.location.assign(url);
      }
      /** 跳转成功后 通知 listeners */
      applyTx(nextAction);
    }
  }

  function replace(to: To, state?: any) {
    let nextAction = Action.REPLACE;
    let nextLocation = getNextLocation(to, state);

    function retry() {
      replace(to, state);
    }
    if (allowTx(nextAction, nextLocation, retry)) {
      const [historyState, url] = getHistoryStateAndUrl(nextLocation, index);

      globalHistory.replaceState(historyState, "", url);

      applyTx(nextAction);
    }
  }

  const history: BrowserHistory = {
    get action() {
      return action;
    },
    get location() {
      return location;
    },
    createHref,
    push,
    replace,
    go,
    back: function () {
      go(-1);
    },
    forward() {
      go(1);
    },
    listen(listener) {
      return listeners.push(listener);
    },
    block(blocker) {
      const unBlocker = blockers.push(blocker);

      // 有监听页面卸载事件时，要监听该事件
      if (blockers.length === 1) {
        window.addEventListener(BeforeUnloadEventType, promptBeforeUnload);
      }
      return function () {
        unBlocker();

        if (blockers.length === 0) {
          window.removeEventListener(BeforeUnloadEventType, promptBeforeUnload);
        }
      };
    },
  };
  return history;
}

type Events<F> = {
  length: number;
  push: (fn: F) => () => void;
  call: (...args: any) => void;
};

function createEvents<F extends Function>(): Events<F> {
  let handlers: F[] = [];

  return {
    get length() {
      return handlers.length;
    },
    push: function (fn: F) {
      handlers.push(fn);

      return function () {
        handlers = handlers.filter((ls) => ls !== fn);
      };
    },
    call: function (...args) {
      handlers.forEach((handler) => handler && handler(...args));
    },
  };
}

function createKey() {
  return Math.random().toString(36).substr(2, 8);
}

function promptBeforeUnload(event: Event) {
  event.preventDefault();
  /** IE */
  event.returnValue = false;
}

/** 将 url 字符串变成包含 pathname、search、hash 的对象 */
function parsePath(path: string): Partial<Path> {
  let parsedPath: Partial<Path> = {};

  if (path) {
    const hashIndex = path.indexOf("#");
    if (hashIndex >= 0) {
      parsedPath.hash = path.substr(hashIndex);
      path = path.substr(0, hashIndex);
    }

    const searchIndex = path.indexOf("?");
    if (searchIndex >= 0) {
      parsedPath.search = path.substr(searchIndex);
      path = path.substr(0, searchIndex);
    }

    if (path) {
      parsedPath.pathname = path;
    }
  }

  return parsedPath;
}

/** 将包含 pathname、search、hash 的对象变成 url 字符串 */
function createPath(to: Partial<Path>): string {
  let { pathname = "/", search = "", hash = "" } = to;
  if (search && search !== "?") {
    pathname = pathname + (search.charAt(0) === "?" ? search : "?" + search);
  }
  if (hash && hash !== "#") {
    pathname = pathname + (hash.charAt(0) === "#" ? hash : "#" + hash);
  }

  return pathname;
}
