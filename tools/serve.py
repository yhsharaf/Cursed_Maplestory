"""Static server for game/ with caching off (so edits to game.js / atlases show up on reload).
usage: python tools/serve.py [port] [--lan]
  default : only this PC can open it (http://localhost:8765/)
  --lan   : phones on the same Wi-Fi can open it too; prints the address to type on the phone"""
import http.server, os, sys, functools, socket
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
port = int(args[0]) if args else 8765
lan = "--lan" in sys.argv
if lan:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1)); ip = s.getsockname()[0]     # no traffic is sent; just picks the Wi-Fi address
    except OSError:
        ip = "this-PC's-IP"
    finally:
        s.close()
    ts = ""
    try:                                                              # Tailscale: reachable from anywhere on your tailnet
        import subprocess
        ts = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=5).stdout.split()[0]
    except Exception:
        pass
    print(f"\n  On your phone (same Wi-Fi), open:  http://{ip}:{port}/          (low-poly; add ?orig=1 for Cuphead's art)")
    if ts: print(f"  Over Tailscale (any network), open: http://{ts}:{port}/")
    print("  (Windows may ask to allow Python on private networks: allow it.)\n")
http.server.ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", port), functools.partial(NoCache, directory=root)).serve_forever()
