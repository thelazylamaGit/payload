"""Check actual pnpm tarballs, including wildcard exports and runtime assets."""
import glob
import json
import sys
import tarfile
from pathlib import PurePosixPath

root = sys.argv[1] if len(sys.argv) > 1 else 'artifacts'
expected = {'@payloadcms/ui', '@payloadcms/translations'}
found = set()
versions = set()
for filename in glob.glob(f'{root}/*.tgz'):
    with tarfile.open(filename) as archive:
        manifest = json.load(archive.extractfile('package/package.json'))
        name = manifest['name']
        assert name in expected and name not in found, name
        found.add(name)
        versions.add(manifest['version'])
        files = set(archive.getnames())

        def check_exports(value):
            if isinstance(value, str) and value.startswith('./'):
                target = 'package/' + value[2:]
                assert any(PurePosixPath(file).match(target) for file in files), value
                assert '/src/' not in target, value
            elif isinstance(value, dict):
                for target in value.values():
                    check_exports(target)
            elif isinstance(value, list):
                for target in value:
                    check_exports(target)

        check_exports(manifest['exports'])
        for key in ('main', 'types'):
            if key in manifest:
                check_exports(manifest[key])
        for section in ('dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'):
            for dependency, version in manifest.get(section, {}).items():
                assert not version.startswith(('workspace:', 'catalog:', 'link:')), (dependency, version)
        if name == '@payloadcms/ui':
            for path in ('dist/styles.css', 'dist/scss/styles.scss', 'dist/assets/index.js',
                         'dist/elements/ClipboardAction/insertBlockFromClipboard.js'):
                assert 'package/' + path in files, path
        else:
            english = archive.extractfile('package/dist/languages/en.js').read().decode()
            for label in ('Copy Block', 'Paste Block Below', 'Paste Block'):
                assert label in english, label
        print(f'Verified {name}@{manifest["version"]}: {len(files)} packed entries')
assert found == expected, found
assert len(versions) == 1, versions
