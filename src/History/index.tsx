import { useEffect, useState } from "react";
import { createBrowserHistory } from "./history";

let unblock: Function | undefined

export function HistoryComp() {
  const history = createBrowserHistory();

  const [block, setBlock] = useState(false);

  history.listen((update) => {
    console.log("url 变化了", update);
  });

  useEffect(() => {
    if (block) {
      unblock = history.block((tx) => {
        console.log("blick", tx);
        if (
          window.confirm(
            `Are you sure you want to go to ${tx.location.pathname +
              tx.location.hash}?`
          )
        ) {
          setBlock(false);
          unblock?.();
          tx.retry();
        }
      });
    } else {
      unblock?.();
      unblock = undefined;
    }
  }, [block, history])

  return (
    <div>
      <h2>history 库</h2>
      <p>
        <span>back &amp; forward: </span>
        <br />
        <div
          className="button-div"
          onClick={() => {
            history.back();
          }}
        >
          back
        </div>
        <div
          className="button-div"
          onClick={() => {
            history.forward();
          }}
        >
          forward
        </div>
      </p>
      <p>
        <span>pushState &amp; replaceState: </span>
        <br />

        <div>
          <div
            className="button-div"
            onClick={() => {
              history.push("/");
            }}
          >
            push /
          </div>
          <div
            className="button-div"
            onClick={() => {
              history.push("/one");
            }}
          >
            push /one
          </div>
          <div
            className="button-div"
            onClick={() => {
              history.push("/two");
            }}
          >
            push /two
          </div>
        </div>

        <div>
          <div
            className="button-div"
            onClick={() => {
              history.replace("/");
            }}
          >
            replaceState /
          </div>
          <div
            className="button-div"
            onClick={() => {
              history.replace("/one");
            }}
          >
            replaceState /one
          </div>
          <div
            className="button-div"
            onClick={() => {
              history.replace("/two");
            }}
          >
            replaceState /two
          </div>
        </div>
      </p>

      <p>
        <span>block</span>

        <div
          onClick={() => {
            setBlock((v) => !v);
          }}
          className="button-div"
        >
          {block ? "unblock" : "block"}
        </div>
      </p>
    </div>
  );
}
