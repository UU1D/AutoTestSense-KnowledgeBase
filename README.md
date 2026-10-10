# Commonsense Atlas

A dependency-free static explorer for generalized and instance-level commonsense
knowledge. The site is designed for GitHub Pages and uses hash routing so detail
links work without server-side rewrites.

## Build the browser data

From this directory:

```powershell
node .\scripts\build-data.mjs
```

The script expects the source package at `..\commonsense\package`. An alternative
package path can be supplied as the first argument.

## Preview locally

Do not open `index.html` directly because browsers restrict `fetch()` for local
files. Start a local HTTP server:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173/>.

## GitHub Pages

Publish the repository root from the default branch, or deploy the same static
files with a GitHub Actions Pages workflow. All asset URLs are relative, so the
site works under a project path such as `/commonsense_web/`.

