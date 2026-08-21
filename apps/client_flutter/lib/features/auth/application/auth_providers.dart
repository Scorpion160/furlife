import 'package:client_flutter/core/config/app_config.dart';
import 'package:client_flutter/core/network/api_client.dart';
import 'package:client_flutter/core/network/api_exception.dart';
import 'package:client_flutter/core/storage/device_identity_store.dart';
import 'package:client_flutter/core/storage/token_store.dart';
import 'package:client_flutter/features/auth/data/auth_api.dart';
import 'package:client_flutter/features/auth/data/auth_repository.dart';
import 'package:client_flutter/features/auth/domain/auth_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final appConfigProvider = Provider<AppConfig>((ref) {
  throw StateError('appConfigProvider must be overridden at startup');
});

final apiClientProvider =
    Provider<ApiClient>((ref) => ApiClient(ref.watch(appConfigProvider)));

final secureStorageProvider =
    Provider<FlutterSecureStorage>((ref) => const FlutterSecureStorage());

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStorageProvider)),
);

final deviceIdentityStoreProvider = Provider<DeviceIdentityStore>(
  (ref) => DeviceIdentityStore(ref.watch(secureStorageProvider)),
);

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(
      ref.watch(apiClientProvider), ref.watch(deviceIdentityStoreProvider)),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) =>
      AuthRepository(ref.watch(authApiProvider), ref.watch(tokenStoreProvider)),
);

enum AuthStatus { checking, signedOut, signedIn }

class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.pendingChallenge,
    this.isBusy = false,
    this.errorMessage,
  });

  const AuthState.checking() : this(status: AuthStatus.checking, isBusy: true);

  final AuthStatus status;
  final UserProfile? user;
  final PendingPhoneChallenge? pendingChallenge;
  final bool isBusy;
  final String? errorMessage;

  AuthState copyWith({
    AuthStatus? status,
    UserProfile? user,
    bool clearUser = false,
    PendingPhoneChallenge? pendingChallenge,
    bool clearPendingChallenge = false,
    bool? isBusy,
    String? errorMessage,
    bool clearError = false,
  }) =>
      AuthState(
        status: status ?? this.status,
        user: clearUser ? null : user ?? this.user,
        pendingChallenge: clearPendingChallenge
            ? null
            : pendingChallenge ?? this.pendingChallenge,
        isBusy: isBusy ?? this.isBusy,
        errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthState.checking()) {
    _restore();
  }

  final AuthRepository _repository;

  Future<void> _restore() async {
    try {
      final user = await _repository.restore();
      state = AuthState(
        status: user == null ? AuthStatus.signedOut : AuthStatus.signedIn,
        user: user,
      );
    } catch (_) {
      state = const AuthState(status: AuthStatus.signedOut);
    }
  }

  Future<void> startPhone(String rawPhone) async {
    final phone = rawPhone.replaceAll(RegExp(r'[\s()-]'), '');
    state = state.copyWith(isBusy: true, clearError: true);
    try {
      final challenge = await _repository.startPhone(phone);
      state = state.copyWith(
        status: AuthStatus.signedOut,
        pendingChallenge: challenge,
        isBusy: false,
        clearError: true,
      );
    } on ApiException catch (error) {
      state = state.copyWith(isBusy: false, errorMessage: error.message);
    } catch (_) {
      state = state.copyWith(
        isBusy: false,
        errorMessage: 'Une erreur inattendue est survenue.',
      );
    }
  }

  Future<void> verifyCode(String code) async {
    final challenge = state.pendingChallenge;
    if (challenge == null) return;
    state = state.copyWith(isBusy: true, clearError: true);
    try {
      final user = await _repository.verifyPhone(
          challenge: challenge, code: code.trim());
      state = AuthState(status: AuthStatus.signedIn, user: user);
    } on ApiException catch (error) {
      state = state.copyWith(isBusy: false, errorMessage: error.message);
    } catch (_) {
      state = state.copyWith(
        isBusy: false,
        errorMessage: 'Une erreur inattendue est survenue.',
      );
    }
  }

  void cancelChallenge() {
    state = state.copyWith(clearPendingChallenge: true, clearError: true);
  }

  Future<void> logout() async {
    state = state.copyWith(isBusy: true, clearError: true);
    await _repository.logout();
    state = const AuthState(status: AuthStatus.signedOut);
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref.watch(authRepositoryProvider)),
);
