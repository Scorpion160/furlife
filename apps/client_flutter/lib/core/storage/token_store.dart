import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StoredTokens {
  const StoredTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.refreshExpiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final DateTime refreshExpiresAt;
}

class TokenStore {
  TokenStore(this._storage);

  static const _accessTokenKey = 'auth.access_token';
  static const _refreshTokenKey = 'auth.refresh_token';
  static const _accessExpiryKey = 'auth.access_expires_at';
  static const _refreshExpiryKey = 'auth.refresh_expires_at';

  final FlutterSecureStorage _storage;

  Future<StoredTokens?> read() async {
    final values = await Future.wait([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _refreshTokenKey),
      _storage.read(key: _accessExpiryKey),
      _storage.read(key: _refreshExpiryKey),
    ]);
    if (values.any((value) => value == null || value.isEmpty)) return null;

    final accessExpiry = DateTime.tryParse(values[2]!);
    final refreshExpiry = DateTime.tryParse(values[3]!);
    if (accessExpiry == null || refreshExpiry == null) {
      await clear();
      return null;
    }

    return StoredTokens(
      accessToken: values[0]!,
      refreshToken: values[1]!,
      accessExpiresAt: accessExpiry,
      refreshExpiresAt: refreshExpiry,
    );
  }

  Future<void> write(StoredTokens tokens) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: tokens.accessToken),
      _storage.write(key: _refreshTokenKey, value: tokens.refreshToken),
      _storage.write(
          key: _accessExpiryKey,
          value: tokens.accessExpiresAt.toIso8601String()),
      _storage.write(
          key: _refreshExpiryKey,
          value: tokens.refreshExpiresAt.toIso8601String()),
    ]);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _accessExpiryKey),
      _storage.delete(key: _refreshExpiryKey),
    ]);
  }
}
