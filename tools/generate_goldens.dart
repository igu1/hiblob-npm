// Golden generator: runs the *Dart* hiblob core and writes its exact SVG
// output for a representative name/option set, so the TypeScript port can be
// tested for byte-level parity (see npm/hiblob/test/goldens.test.ts).
//
// Because Dart's `package:hiblob` imports resolve only inside the Flutter
// package tree, run it from inside `pub/hiblob-flutter` with a temporary
// copy of this file:
//
//   cd <repo>/pub/hiblob-flutter
//   mkdir -p tool
//   cp ../../npm/hiblob/tools/generate_goldens.dart tool/
//   flutter pub get --enforce-lockfile
//   dart run tool/generate_goldens.dart ../../npm/hiblob/test/goldens.json
//   rm -r tool
//
// Any change to either implementation that shows up here is a breaking
// visual-contract change.
import 'dart:convert';
import 'dart:io';

import 'package:hiblob/hiblob.dart';

void main(List<String> args) {
  final out = args.isEmpty ? 'goldens.json' : args.first;
  final entries = <Map<String, Object>>[];

  String add(String key, String name, HiblobOptions options, String svg) {
    entries.add({
      'key': key,
      'name': name,
      'options': _optionsToDb(options),
      'svg': svg,
    });
    return svg;
  }

  // §13.10 — the frozen snapshot golden.
  add(
    'snapshot:ada@example.com',
    'ada@example.com',
    HiblobOptions(background: Backdrop.squircle, expression: happy),
    svgFromName(
      'ada@example.com',
      options: HiblobOptions(background: Backdrop.squircle, expression: happy),
    ),
  );

  final shapes = shapeBands.keys.toList();

  // Shape × radius sweep (accessories off, mouth on): every silhouette,
  // small and large, with the palette fully name-driven.
  for (final shape in shapes) {
    final mid = bandCenter(shape);
    for (final radius in [0.0, 1.0]) {
      final options = HiblobOptions(
        traits: {'shape': mid, 'body.r': radius},
        accessories: allOff,
      );
      add(
        'shape:$shape:r$radius',
        'cap-fit',
        options,
        svgFromName('cap-fit', options: options),
      );
    }
  }

  // Every expression on a round body.
  for (final expression in expressions) {
    final options = HiblobOptions(
      traits: const {'shape': 0.0},
      expression: expression,
    );
    add(
      'expr:${expression.id}',
      'ada',
      options,
      svgFromName('ada', options: options),
    );
  }

  // Accessories pinned on, for every silhouette — the fitted cap is the
  // risky part.
  for (final shape in shapes) {
    final options = HiblobOptions(
      traits: {'shape': bandCenter(shape), 'body.r': 0.5},
      accessories: allOn,
    );
    add(
      'acc:on:$shape',
      'acc-fitted',
      options,
      svgFromName('acc-fitted', options: options),
    );
  }

  // Accessories all off.
  add(
    'acc:off:round',
    'cap-fit',
    HiblobOptions(traits: const {'shape': 0.0}, accessories: allOff),
    svgFromName(
      'cap-fit',
      options: HiblobOptions(traits: const {'shape': 0.0}, accessories: allOff),
    ),
  );

  // Backdrop plates.
  for (final kind in [Backdrop.squircle, Backdrop.circle, Backdrop.square]) {
    final options = HiblobOptions(background: kind);
    add(
      'backdrop:${kind.name}',
      'ada@example.com',
      options,
      svgFromName('ada@example.com', options: options),
    );
  }

  // Palette pins win.
  final pinned = HiblobOptions(
    background: Backdrop.circle,
    palette: const {
      PaletteKeys.head: '#FF0000',
      PaletteKeys.eye: '#00FF00',
      PaletteKeys.bg: '#0000FF',
    },
  );
  add('palette:pins', 'ada', pinned, svgFromName('ada', options: pinned));

  // Hue and tone pins.
  final hueTone = HiblobOptions(
    hue: 210,
    tone: 0.5,
    background: Backdrop.squircle,
  );
  add('pins:hue-tone', 'a', hueTone, svgFromName('a', options: hueTone));

  // Every tone band.
  for (final band in toneBands.keys) {
    final options = HiblobOptions(
      tone: tintMiddle(band),
      traits: const {'shape': 0.0},
    );
    add('tone:$band', 'tonal', options, svgFromName('tonal', options: options));
  }

  // Normalization off keeps the raw name.
  final raw = HiblobOptions(normalize: false);
  add('raw:  ADA ', '  ADA ', raw, svgFromName('  ADA ', options: raw));

  final file = File(out);
  Directory.fromUri(Uri.file(out).resolve('.')).createSync(recursive: true);
  file.writeAsStringSync(
    const JsonEncoder.withIndent('  ').convert({
      'generator': 'hiblob (dart) 1.0.0 — golden SVGs for parity tests',
      'entries': entries,
    }),
  );
  stdout.writeln('${entries.length} goldens → ${file.path}');
}

const allOn = {
  AccessoryKeys.glasses: 1.0,
  AccessoryKeys.fringe: 1.0,
  AccessoryKeys.blush: 1.0,
  AccessoryKeys.antennae: 1.0,
};
const allOff = {
  AccessoryKeys.glasses: 0.0,
  AccessoryKeys.fringe: 0.0,
  AccessoryKeys.blush: 0.0,
  AccessoryKeys.antennae: 0.0,
};

/// The center of a band, so a pinned trait lands mid-band.
double bandCenter(String shape) {
  final (start, end) = shapeBands[shape]!;
  final mid = (start + end) / 2;
  return mid >= 1.0 ? 0.999999 : mid;
}

double tintMiddle(String band) {
  final (start, end) = toneBands[band]!;
  final mid = (start + end) / 2;
  return mid >= 1.0 ? 0.999999 : mid;
}

Object _optionsToDb(HiblobOptions o) {
  final db = <String, Object>{};
  if (o.background != Backdrop.none) db['background'] = o.background.name;
  final hue = o.hue;
  if (hue != null) db['hue'] = hue;
  final tone = o.tone;
  if (tone != null) db['tone'] = tone;
  if (o.palette.isNotEmpty) db['palette'] = o.palette;
  if (o.accessories.isNotEmpty) db['accessories'] = o.accessories;
  if (!o.mouth) db['mouth'] = false;
  if (o.traits.isNotEmpty) db['traits'] = o.traits;
  if (!o.normalize) db['normalize'] = false;
  if (!o.contrast) db['contrast'] = false;
  if (o.expression != idle) db['expression'] = o.expression.id;
  return db;
}
