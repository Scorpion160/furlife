import 'package:client_flutter/core/network/api_client.dart';
import 'package:client_flutter/core/storage/device_identity_store.dart';
import 'package:client_flutter/core/storage/token_store.dart';
import 'package:client_flutter/features/auth/domain/auth_models.dart';

class AuthApi {
  const AuthApi(this._client, this._deviceIdentity);

  final ApiClient _client;
  final DeviceIdentityStore _deviceIdentity;

  Future<PendingPhoneChallenge> startPhone(String phoneE164) async {
    final json = await _client.postJson(
      'auth/phone/start',
      body: {'phoneE164': phoneE164},
      headers: await _deviceHeaders(),
    );
    return PendingPhoneChallenge(
      challengeId: json['challengeId'] as String,
      phoneE164: phoneE164,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      resendAvailableAt: DateTime.parse(json['resendAvailableAt'] as String),
    );
  }

  Future<AuthSession> verifyPhone({
    required PendingPhoneChallenge challenge,
    required String code,
  }) async {
    final json = await _client.postJson(
      'auth/phone/verify',
      body: {
        'challengeId': challenge.challengeId,
        'phoneE164': challenge.phoneE164,
        'code': code,
      },
      headers: await _deviceHeaders(),
    );
    return AuthSession.fromJson(json);
  }

  Future<StoredTokens> refresh(String refreshToken) async {
    final json = await _client.postJson(
      'auth/refresh',
      body: {'refreshToken': refreshToken},
      headers: await _deviceHeaders(),
    );
    return StoredTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      accessExpiresAt: DateTime.parse(json['accessExpiresAt'] as String),
      refreshExpiresAt: DateTime.parse(json['refreshExpiresAt'] as String),
    );
  }

  Future<UserProfile> me(String accessToken) async {
    final json = await _client.getJson(
      'auth/me',
      headers: {
        ...await _deviceHeaders(),
        'Authorization': 'Bearer $accessToken',
      },
    );
    return UserProfile.fromJson(json);
  }

  Future<void> logout(String accessToken) async {
    await _client.postJson(
      'auth/logout',
      headers: {
        ...await _deviceHeaders(),
        'Authorization': 'Bearer $accessToken',
      },
    );
  }

  Future<Map<String, String>> _deviceHeaders() async => {
        'X-Device-Id': await _deviceIdentity.getOrCreate(),
      };
}
