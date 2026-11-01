# Initial proposal reference (PR #145)

`pre-pedal-overlap.json.gz` contains unmodified UTF-8 source for
`evolution.js`, `evolution-strategies.js` and `trajectory-search.js` from
`f7621cd9a93c23f8631026c9a1671c970f44a27e`, the pre-overlap parent.

The loader executes these three modules in an isolated context, including the
trajectory module's own original strategy closure. All other dependencies,
vehicle/track data and prepared seeds are current and shared with the test.
This tests proposal compatibility, not historical simulation outcomes. Exact
proposal values and post-reservation RNG output must match in the same runtime;
no tolerance or platform-specific numerical golden is used.

The source archive is checked by SHA-256, not a hash of floating-point results.
It permits shallow/offline test runs. Do not regenerate it from current source
or output to bless a failure. A deliberate baseline change needs review.

To reproduce the archive from the repository root with the parent available:

```sh
python3 - <<'PY'
import gzip, json, pathlib, subprocess
commit = 'f7621cd9a93c23f8631026c9a1671c970f44a27e'
names = ['evolution.js', 'evolution-strategies.js', 'trajectory-search.js']
files = {name: subprocess.check_output(
    ['git', 'show', commit + ':evolving_drift/' + name]).decode('utf-8')
    for name in names}
bundle = {'commit': commit, 'files': files}
data = (json.dumps(bundle, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
pathlib.Path('evolving_drift/test-fixtures/pre-pedal-overlap.json.gz').write_bytes(
    gzip.compress(data, mtime=0))
PY
```

Compression headers may vary by Python/zlib version. Verify the decompressed
source byte-for-byte against the pinned Git blobs before reviewing any archive
digest change in the loader.
