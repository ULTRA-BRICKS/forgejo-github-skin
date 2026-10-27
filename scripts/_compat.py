"""Shared Forgejo compatibility helpers used by audit and installer gates."""
from __future__ import annotations
import errno, hashlib, os, stat
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import BinaryIO


def normalize_forgejo_version(version: str) -> str:
    clean = version.split('+', 1)[0].removeprefix('v')
    if not clean:
        raise ValueError('Forgejo version is empty')
    return clean


def require_tested_version(version: str, manifest: dict) -> str:
    clean = normalize_forgejo_version(version)
    tested = manifest.get('testedForgejo')
    if not isinstance(tested, list) or clean not in tested:
        raise ValueError(
            f'Forgejo {clean} has no approved compatibility entry. '
            'Run source audit and browser QA first.'
        )
    return clean


def audit_fingerprints(audit: object, version: str) -> dict:
    """Return the audit's sha256 map, failing closed on a malformed audit or one for another version."""
    if not isinstance(audit, dict):
        raise ValueError('audit is not a JSON object')
    if audit.get('version') != version:
        raise ValueError(f'audit is for version {audit.get("version")}, not {version}')
    fingerprints = audit.get('sha256')
    if not isinstance(fingerprints, dict) or not fingerprints:
        raise ValueError('audit has no source fingerprints')
    for name in fingerprints:
        if not name or any(path.anchor or '..' in path.parts for path in (PurePosixPath(name), PureWindowsPath(name))):
            raise ValueError(f'audit fingerprint key {name!r} is empty, absolute or outside the source checkout')
    return fingerprints


class UnsafeSourcePath(ValueError):
    """An audit key reaches a symlink or a non-regular file instead of a regular file inside the checkout."""


def _open_child(parent_fd: int, part: str, directory: bool) -> int:
    """Open one path component below parent_fd without following links; the opened inode must be the one just inspected."""
    try:
        before = os.stat(part, dir_fd=parent_fd, follow_symlinks=False)
    except (FileNotFoundError, NotADirectoryError):
        raise FileNotFoundError(part) from None
    if stat.S_ISLNK(before.st_mode):
        raise UnsafeSourcePath(part)
    if directory and not stat.S_ISDIR(before.st_mode):
        raise FileNotFoundError(part)
    if not directory and not stat.S_ISREG(before.st_mode):
        raise UnsafeSourcePath(part)
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, 'O_CLOEXEC', 0) | (os.O_DIRECTORY if directory else 0)
    try:
        fd = os.open(part, flags, dir_fd=parent_fd)
    except OSError as error:
        if error.errno == errno.ENOENT:
            raise FileNotFoundError(part) from None
        if error.errno in (errno.ELOOP, errno.EMLINK, errno.ENOTDIR, errno.ENXIO):
            raise UnsafeSourcePath(part) from error  # swapped for a link or special file after the check
        raise
    after = os.fstat(fd)
    if (after.st_dev, after.st_ino) != (before.st_dev, before.st_ino):
        os.close(fd)
        raise UnsafeSourcePath(part)
    return fd


def _open_in_checkout(checkout: Path, key: str) -> BinaryIO:
    """Open the regular file at a relative key for binary reading, refusing any symlink on the way.

    The checkout itself is opened as given (the operator chooses it); every deeper component is opened relative to the
    previous descriptor with O_NOFOLLOW, so no path below the checkout can be redirected outside it. A key that is empty,
    absolute or has a '..' component is refused before any open. The caller closes the returned file, which is the very
    inode the walk inspected last, so whatever it reads is what was validated.
    Raises FileNotFoundError for an absent file and UnsafeSourcePath for a link, a non-regular file or an escaping key.
    """
    if os.open not in os.supports_dir_fd or os.stat not in os.supports_dir_fd or os.stat not in os.supports_follow_symlinks or not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
        raise ValueError('this platform has no descriptor-relative open; refusing to read source files without root confinement')
    path = PurePosixPath(key)
    parts = path.parts
    if not parts or path.is_absolute() or '..' in parts:
        raise UnsafeSourcePath(key)
    fd = os.open(checkout, os.O_RDONLY | os.O_DIRECTORY | getattr(os, 'O_CLOEXEC', 0))
    try:
        for index, part in enumerate(parts):
            child = _open_child(fd, part, directory=index < len(parts) - 1)
            os.close(fd)
            fd = child
        handle = os.fdopen(fd, 'rb')
        fd = -1
        return handle
    finally:
        if fd >= 0:
            os.close(fd)


def sha256_in_checkout(checkout: Path, key: str) -> str:
    """Hash the regular file at a relative key without reading through any symlink (see _open_in_checkout)."""
    digest = hashlib.sha256()
    with _open_in_checkout(checkout, key) as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_bytes_in_checkout(checkout: Path, key: str) -> bytes:
    """Return the exact bytes of the regular file at a relative key without reading through any symlink.

    Callers that must verify a digest hash these bytes themselves, so the content that was checked is the content used;
    never hash with sha256_in_checkout and then read the key again, which opens it a second time.
    """
    with _open_in_checkout(checkout, key) as handle:
        return handle.read()
