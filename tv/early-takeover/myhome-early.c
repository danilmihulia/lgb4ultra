/* My Home: early takeover, so LG's stock hub never appears at boot.
 *
 * Loaded into LG's application manager (SAM) through LD_PRELOAD from /var/systemd/system/env/sam.env
 * (sam.service reads that EnvironmentFile; /var is writable and persistent). The constructor runs before
 * SAM's main(): it waits until the flash with our files is mounted (/media, ~12 s after power-on), bind-mounts
 * our hub over com.webos.app.home and our screensaver over com.webos.app.screensaver (same mounts as boot
 * hooks 29/30), and returns. SAM then scans the apps and launches OUR hub as the first and only home.
 *
 * Safety:
 *  - acts only inside /usr/sbin/sam; in every other process it does nothing (and SAM's children don't inherit it:
 *    our path is removed from LD_PRELOAD in the environment);
 *  - does nothing in Homebrew Channel failsafe mode or if our files are missing;
 *  - waits at most 15 s, then lets SAM start normally;
 *  - a failed mount is just logged. Revert: rm /var/systemd/system/env/sam.env (and the .so).
 * Log: /tmp/myhome-early.log
 * Build: zig cc -target arm-linux-gnueabi.2.17 -shared -fPIC -O2 -s -o libmyhome-early.so myhome-early.c
 */
#define _GNU_SOURCE
#define _FILE_OFFSET_BITS 64   /* 32-bit userspace: plain stat() fails with EOVERFLOW on ext4's 64-bit inodes */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/mount.h>
#include <sys/stat.h>

#define SELF "/var/lib/myhome/libmyhome-early.so"

static double up(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }

static void lg(const char *fmt, const char *a, const char *b) {
    FILE *f = fopen("/tmp/myhome-early.log", "a");
    if (!f) return;
    fprintf(f, "t=%.2fs ", up());
    fprintf(f, fmt, a ? a : "", b ? b : "");
    fputc('\n', f);
    fclose(f);
}

static int exists(const char *p) { struct stat s; return stat(p, &s) == 0; }

static int same_inode(const char *a, const char *b) {
    struct stat x, y;
    if (stat(a, &x) || stat(b, &y)) return 0;
    return x.st_ino == y.st_ino && x.st_dev == y.st_dev;
}

/* bind src over dst unless it is already there (checked through a file both contain) */
static void bind(const char *src, const char *dst, const char *probe) {
    char ps[512], pd[512];
    snprintf(ps, sizeof ps, "%s%s", src, probe);
    snprintf(pd, sizeof pd, "%s%s", dst, probe);
    if (!exists(src) || !exists(dst)) { lg("skip %s -> %s (missing)", src, dst); return; }
    if (same_inode(ps, pd)) { lg("already %s -> %s", src, dst); return; }   /* probe "" → compares src and dst themselves */
    if (mount(src, dst, NULL, MS_BIND, NULL) == 0) lg("bind ok %s -> %s", src, dst);
    else lg("bind FAILED %s -> %s", src, dst);
}

/* remove our path from LD_PRELOAD so processes SAM starts don't load us */
static void drop_self_from_env(void) {
    const char *v = getenv("LD_PRELOAD");
    if (!v || !strstr(v, SELF)) return;
    char out[1024] = "", buf[1024];
    snprintf(buf, sizeof buf, "%s", v);
    for (char *tok = strtok(buf, ": "); tok; tok = strtok(NULL, ": ")) {
        if (strcmp(tok, SELF) == 0) continue;
        if (out[0]) strncat(out, ":", sizeof out - strlen(out) - 1);
        strncat(out, tok, sizeof out - strlen(out) - 1);
    }
    if (out[0]) setenv("LD_PRELOAD", out, 1); else unsetenv("LD_PRELOAD");
}

__attribute__((constructor)) static void myhome_early(void) {
    char exe[256] = "";
    ssize_t n = readlink("/proc/self/exe", exe, sizeof exe - 1);
    if (n > 0) exe[n] = 0;
    drop_self_from_env();
    /* Triggers: MYHOME_EARLY=1 (set in /var/systemd/system/env/criu_remove_img.env — that tiny boot script starts
     * right after the writable flash is mounted, ~12.9 s; SAM itself starts at ~6.4 s, before /var's env files exist),
     * or running inside SAM, or MYHOME_EARLY_TEST=1 (dry check: logs "already" while the mounts exist). */
    int trigger = getenv("MYHOME_EARLY") != NULL;
    unsetenv("MYHOME_EARLY");
    if (!trigger && strcmp(exe, "/usr/sbin/sam") != 0 && !getenv("MYHOME_EARLY_TEST")) return;
    int in_sam = strcmp(exe, "/usr/sbin/sam") == 0;

    lg("start in %s%s", exe, "");
    if (exists("/var/luna/preferences/webosbrew_failsafe")) { lg("failsafe flag -> do nothing%s%s", "", ""); return; }

    const char *H = "/media/developer/myhome-home", *SV = "/media/developer/myhome-saver";
    double t0 = up();
    while (!exists("/media/developer/myhome-home/appinfo.json") && up() - t0 < 15) usleep(100 * 1000);
    if (!exists("/media/developer/myhome-home/appinfo.json")) { lg("our files never appeared -> stock boot%s%s", "", ""); return; }
    lg("files ready after %s%s", "", "");

    const char *HT = "/usr/palm/applications/com.webos.app.home", *ST = "/usr/palm/applications/com.webos.app.screensaver";
    int had_home = same_inode("/media/developer/myhome-home/appinfo.json", "/usr/palm/applications/com.webos.app.home/appinfo.json");
    bind(H, HT, "/appinfo.json");
    if (exists("/media/developer/myhome-saver/appinfo.json")) {
        bind(SV, ST, "/appinfo.json");
        bind("/media/developer/myhome-home/walls", "/usr/palm/applications/com.webos.app.screensaver/walls", "");
        bind("/media/developer/myhome-home/walls.json", "/usr/palm/applications/com.webos.app.screensaver/walls.json", "");
        bind("/media/developer/myhome-home/walls-screen", "/usr/palm/applications/com.webos.app.screensaver/walls-screen", "");
    }
    FILE *f = fopen("/tmp/myhome-early-done", "w"); if (f) fclose(f);
    /* SAM already scanned the apps at ~6 s (stock home). Queue a SAM restart so it rescans and brings up OUR hub —
     * now at ~13 s instead of hook 30's ~35 s. --no-block: just queue the job, never wait inside boot. */
    /* step 2 (compositor patches + restarts) lives in an editable script next to us; without it just restart SAM */
    if (!in_sam && !had_home && !getenv("MYHOME_EARLY_TEST") &&
        same_inode("/media/developer/myhome-home/appinfo.json", "/usr/palm/applications/com.webos.app.home/appinfo.json")) {
        int rc = exists("/var/lib/myhome/early.sh") ? system("/bin/sh /var/lib/myhome/early.sh")
                                                    : system("/bin/systemctl --no-block restart sam.service");
        lg("step 2 rc=%s%s", rc == 0 ? "0" : "!=0", "");
    }
    lg("done%s%s", "", "");
}
