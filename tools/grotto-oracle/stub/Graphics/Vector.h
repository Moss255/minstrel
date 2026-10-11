#pragma once
struct Matrix3x3 { int m[9]; };
inline void Mat3x3_WriteIdentity(Matrix3x3* m) { for (int i = 0; i < 9; i++) m->m[i] = (i % 4 == 0) ? 0x1000 : 0; }
inline void Mat3x3_WriteRotationY(Matrix3x3* m, int s, int c) { Mat3x3_WriteIdentity(m); m->m[0] = c; m->m[2] = -s; m->m[6] = s; m->m[8] = c; }
