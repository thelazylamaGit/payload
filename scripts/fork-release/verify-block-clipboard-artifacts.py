"""Check actual pnpm tarballs, including wildcard exports and runtime assets."""
import argparse
import glob
import json
import tarfile
from pathlib import PurePosixPath

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', nargs='?', default='artifacts')
parser.add_argument('--include-lexical', action='store_true')
parser.add_argument('--include-core', action='store_true', help='also expect payload and @payloadcms/next')
args = parser.parse_args()
root = args.root
expected = {'@payloadcms/ui', '@payloadcms/translations'}
if args.include_lexical:
    expected.add('@payloadcms/richtext-lexical')
if args.include_core:
    expected.update({'payload', '@payloadcms/next'})
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
                         'dist/forms/Form/fieldReducer.js'):
                assert 'package/' + path in files, path
            assert not any('compactClipboardBlockSchema' in file or 'stripClipboardMetadata' in file
                           or 'insertBlockFromClipboard' in file or 'prepareClipboardIDs' in file
                           or 'rowIdentity' in file for file in files)
        elif name == '@payloadcms/translations':
            english = archive.extractfile('package/dist/languages/en.js').read().decode()
            for label in ('Copy Block', 'Paste Block Below', 'Paste Block'):
                assert label in english, label
        elif name == 'payload':
            types = archive.extractfile('package/dist/collections/config/types.d.ts').read().decode()
            assert 'groupBy?: boolean | string' in types, 'admin.groupBy string type'
        elif name == '@payloadcms/next':
            for path in ('dist/views/List/getInitialGroupBy.js', 'dist/views/List/getOptionLabel.js'):
                assert 'package/' + path in files, path
        print(f'Verified {name}@{manifest["version"]}: {len(files)} packed entries')
assert found == expected, found
assert len(versions) == 1, versions
