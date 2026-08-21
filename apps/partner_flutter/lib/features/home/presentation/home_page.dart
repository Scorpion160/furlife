import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Furlife Partner')),
      body: const SafeArea(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Missions et voyages',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              SizedBox(height: 12),
              Text('Socle sécurisé prêt pour les parcours Porteur et Livreur.'),
            ],
          ),
        ),
      ),
    );
  }
}
