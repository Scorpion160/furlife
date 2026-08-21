import 'package:flutter/material.dart';

class SessionLoadingPage extends StatelessWidget {
  const SessionLoadingPage({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: SafeArea(
          child: Center(child: CircularProgressIndicator()),
        ),
      );
}
