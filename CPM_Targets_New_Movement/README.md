# PHOTOSENSITIVITY WARNING: This model contains behavior resulting in flashing lights. Beware if you suffer from epilepsy.

# Modification 1: Movement
The first modification that we make to the original model involves the movement of the particles.
As during a real evacuation, it is likely that individuals will not move in the opposite direction from where a collision takes place, but instead continues towards the exits.
To force more movement towards the exits, we add the two vectors responsible for movement: the desired and escape velocity vectors.
Generally, this results in the particles' movement being more focussed towards the exit points.
