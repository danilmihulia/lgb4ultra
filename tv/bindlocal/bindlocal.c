/*
 * bindlocal — keep WAM's DevTools port (9998) on the TV itself.
 *
 * LG starts WebAppMgr with --remote-debugging-port=9998 and the engine binds it to 0.0.0.0 (all networks, no auth).
 * The engine has no --remote-debugging-address switch and the TV kernel has no firewall (no iptables filter, no tc),
 * so this tiny LD_PRELOAD library rewrites exactly one call: bind(AF_INET, 0.0.0.0:9998) -> bind(127.0.0.1:9998).
 * Everything else passes through untouched. Our own browser helper (framegate) talks to 127.0.0.1:9998 and keeps working.
 *
 * No libc dependency (raw syscall), so it does not care about the TV's glibc version.
 * Target: 32-bit ARM EABI soft-float userland (ELF flags 0x05000200), like /usr/bin/WebAppMgr.
 * Build:  zig cc -target arm-linux-gnueabi -mcpu=cortex_a7 -shared -nostdlib -fPIC -O2 -o libbindlocal.so bindlocal.c
 */
typedef unsigned short u16;
typedef unsigned int u32;

#define AF_INET   2
#ifndef PORT
#define PORT      9998
#endif
#define PORT_BE   ((u16)(((PORT) >> 8) | (((PORT) & 0xFF) << 8)))   /* htons(PORT) */
#define LOOPBACK  0x0100007Fu    /* 127.0.0.1 in network order on little-endian ARM */
#define NR_BIND   282            /* ARM EABI __NR_bind */

struct in4 { u16 family; u16 port; u32 addr; unsigned char zero[8]; };

extern int *__errno_location(void);   /* resolved from the process's libc at load time */

static long sys_bind(long fd, const void *addr, long len) {
    register long r0 __asm__("r0") = fd;
    register long r1 __asm__("r1") = (long)addr;
    register long r2 __asm__("r2") = len;
    register long r7 __asm__("r7") = NR_BIND;
    __asm__ volatile("svc 0" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r7) : "memory");
    return r0;
}

__attribute__((visibility("default")))
int bind(int fd, const void *addr, unsigned int len) {
    struct in4 copy;
    const struct in4 *a = (const struct in4 *)addr;
    if (a && len >= sizeof(struct in4) && a->family == AF_INET && a->port == PORT_BE && a->addr == 0) {
        copy = *a;
        copy.addr = LOOPBACK;
        addr = &copy;
    }
    long r = sys_bind(fd, addr, len);
    if (r < 0 && r > -4096) { *__errno_location() = (int)-r; return -1; }
    return (int)r;
}
