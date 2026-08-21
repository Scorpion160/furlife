import 'package:client_flutter/features/auth/application/auth_providers.dart';
import 'package:client_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = AppLocalizations.of(context);
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(strings.appName),
        actions: [
          IconButton(
            onPressed: auth.isBusy
                ? null
                : () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            tooltip: strings.logout,
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(strings.tagline,
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(strings.connectedAs(auth.user?.phoneE164 ?? '')),
            const SizedBox(height: 28),
            _ActionCard(
              icon: Icons.outbox_outlined,
              title: strings.sendParcel,
              subtitle: strings.sendParcelSubtitle,
            ),
            const SizedBox(height: 12),
            _ActionCard(
              icon: Icons.inventory_2_outlined,
              title: strings.myParcels,
              subtitle: strings.myParcelsSubtitle,
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard(
      {required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          contentPadding: const EdgeInsets.all(16),
          leading: Icon(icon),
          title: Text(title),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          enabled: false,
        ),
      );
}
