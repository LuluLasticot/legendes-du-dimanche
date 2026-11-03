/** The night stadium behind the game's pages: two floodlight glows and a mown pitch's stripes. */
export function NightBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-floodlight-400/10 blur-3xl" />
      <div className="absolute -top-48 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-floodlight-300/8 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-[42rem] bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.018)_0_80px,transparent_80px_160px)] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
    </div>
  );
}
