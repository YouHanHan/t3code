// The production icon, as GitHub shows the T3 Code app, whatever this build's channel.
import appIconUrl from "../../../../assets/prod/t3-black-web-apple-touch-180.png";
import { IS_YOUHANHAN_CODE } from "../branding";

export function T3AppIcon(props: { readonly className?: string }) {
  return (
    <img
      src={IS_YOUHANHAN_CODE ? "/apple-touch-icon.png" : appIconUrl}
      alt=""
      className={props.className}
    />
  );
}
