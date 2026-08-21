import 'package:client_flutter/core/network/api_exception.dart';
import 'package:client_flutter/core/storage/token_store.dart';
import 'package:client_flutter/features/auth/data/auth_api.dart';
import 'package:client_flutter/features/auth/domain/auth_models.dart';

class AuthRepository {
  const AuthRepository(this._api, this._tokenStore);

  final AuthApi _api;
  final TokenStore _tokenStore;

  Future<PendingPhoneChallenge> startPhone(String phoneE164) =>
      _api.startPhone(phoneE164);

  Future<UserProfile> verifyPhone({
    required PendingPhoneChallenge challenge,
    required String code,
  }) async {
    final session = await _api.verifyPhone(challenge: challenge, code: code);
    await _tokenStore.write(session.tokens);
    return session.user;
  }

  Future<UserProfile?> restore() async {
    var tokens = await _tokenStore.read();
    if (tokens == null ||
        tokens.refreshExpiresAt.isBefore(DateTime.now().toUtc())) {
      await _tokenStore.clear();
      return null;
    }

    if (tokens.accessExpiresAt
        .isBefore(DateTime.now().toUtc().add(const Duration(seconds: 15)))) {
      tokens = await _refresh(tokens.refreshToken);
      if (tokens == null) return null;
    }

    try {
      return await _api.me(tokens.accessToken);
    } on ApiException catch (error) {
      if (!error.isUnauthorized) rethrow;
      final refreshed = await _refresh(tokens.refreshToken);
      if (refreshed == null) return null;
      return _api.me(refreshed.accessToken);
    }
  }

  Future<void> logout() async {
    final tokens = await _tokenStore.read();
    if (tokens != null) {
      try {
        await _api.logout(tokens.accessToken);
      } on ApiException {
        // Local revocation is still required if the network is unavailable.
      }
    }
    await _tokenStore.clear();
  }

  Future<StoredTokens?> _refresh(String refreshToken) async {
    try {
      final refreshed = await _api.refresh(refreshToken);
      await _tokenStore.write(refreshed);
      return refreshed;
    } on ApiException {
      await _tokenStore.clear();
      return null;
    }
  }
}
