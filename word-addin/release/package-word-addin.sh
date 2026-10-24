#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_TEMPLATE="$ADDIN_DIR/manifest-template.xml"
OUTPUT_DIR="$SCRIPT_DIR"

if [ ! -d "$ADDIN_DIR" ]; then
    echo "Error: word-addin directory not found at $ADDIN_DIR" >&2
    exit 1
fi

if [ ! -f "$MANIFEST_TEMPLATE" ]; then
    echo "Error: manifest template not found at $MANIFEST_TEMPLATE" >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    echo "Error: zip command is required but not installed." >&2
    exit 1
fi

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    VERSION="$(sed -n 's|.*<Version>\(.*\)</Version>.*|\1|p' "$MANIFEST_TEMPLATE" | head -n 1)"
fi

if [ -z "$VERSION" ]; then
    echo "Error: could not determine add-in version. Pass it explicitly, for example:" >&2
    echo "  ./release/package-word-addin.sh 1.2.3" >&2
    exit 1
fi

PACKAGE_NAME="Lattice-Word-Addin-macOS-$VERSION"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lattice-word-addin.XXXXXX")"
ARCHIVE_TMP="$STAGING_DIR/$PACKAGE_NAME.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$PACKAGE_NAME.zip"
PACKAGE_ROOT="$STAGING_DIR/$PACKAGE_NAME"
PACKAGED_ADDIN_DIR="$PACKAGE_ROOT/word-addin"

cleanup() {
    rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"
mkdir -p "$PACKAGE_ROOT"

cp -R "$ADDIN_DIR" "$PACKAGED_ADDIN_DIR"
rm -rf "$PACKAGED_ADDIN_DIR/release"

find "$PACKAGE_ROOT" -name '.DS_Store' -type f -delete

chmod 755 "$PACKAGED_ADDIN_DIR/install.command" "$PACKAGED_ADDIN_DIR/uninstall.command"

(
    cd "$STAGING_DIR"
    zip -qry "$ARCHIVE_TMP" "$PACKAGE_NAME"
)

mv -f "$ARCHIVE_TMP" "$ARCHIVE_PATH"

echo "Created release archive:"
echo "  $ARCHIVE_PATH"
