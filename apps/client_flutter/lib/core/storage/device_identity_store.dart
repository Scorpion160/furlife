import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DeviceIdentityStore {
  DeviceIdentityStore(this._storage);

  static const _key = 'device.installation_id';
  final FlutterSecureStorage _storage;

  Future<String> getOrCreate() async {
    final existing = await _storage.read(key: _key);
    if (existing != null && existing.length >= 20) return existing;

    final random = Random.secure();
    final bytes =
        List<int>.generate(24, (_) => random.nextInt(256), growable: false);
    final generated = base64Url.encode(bytes).replaceAll('=', '');
    await _storage.write(key: _key, value: generated);
    return generated;
  }
}
