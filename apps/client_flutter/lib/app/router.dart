import 'package:client_flutter/features/auth/application/auth_providers.dart';
import 'package:client_flutter/features/auth/presentation/otp_page.dart';
import 'package:client_flutter/features/auth/presentation/phone_sign_in_page.dart';
import 'package:client_flutter/features/auth/presentation/session_loading_page.dart';
import 'package:client_flutter/features/home/presentation/home_page.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final _routerRefreshProvider = Provider<ValueNotifier<int>>((ref) {
  final notifier = ValueNotifier<int>(0);
  ref.listen<AuthState>(authControllerProvider, (_, __) => notifier.value++);
  ref.onDispose(notifier.dispose);
  return notifier;
});

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ref.watch(_routerRefreshProvider);
  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.status == AuthStatus.checking) {
        return state.matchedLocation == '/loading' ? null : '/loading';
      }
      if (auth.status == AuthStatus.signedIn) {
        return state.matchedLocation == '/' ? null : '/';
      }
      if (auth.pendingChallenge != null) {
        return state.matchedLocation == '/verify' ? null : '/verify';
      }
      return state.matchedLocation == '/sign-in' ? null : '/sign-in';
    },
    routes: [
      GoRoute(path: '/loading', builder: (_, __) => const SessionLoadingPage()),
      GoRoute(path: '/sign-in', builder: (_, __) => const PhoneSignInPage()),
      GoRoute(path: '/verify', builder: (_, __) => const OtpPage()),
      GoRoute(path: '/', builder: (_, __) => const HomePage()),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
