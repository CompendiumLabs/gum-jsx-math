import type { MathClass, MathMetrics } from 'gum-next-core'

// TeX's inter-atom spacing, in mu. Explicit glue is transparent to this pass.
const SPACING: Partial<Record<MathClass, Partial<Record<MathClass, number>>>> = {
  mord: { mop: 3, mbin: 4, mrel: 5, minner: 3 },
  mop: { mord: 3, mop: 3, mrel: 5, minner: 3 },
  mbin: { mord: 4, mop: 4, mopen: 4, minner: 4 },
  mrel: { mord: 5, mop: 5, mopen: 5, minner: 5 },
  mclose: { mop: 3, mbin: 4, mrel: 5, minner: 3 },
  mpunct: { mord: 3, mop: 3, mrel: 5, mopen: 3, mclose: 3, mpunct: 3, minner: 3 },
  minner: { mord: 3, mop: 3, mbin: 4, mrel: 5, mopen: 3, mpunct: 3, minner: 3 },
}
const LEFT_CANCEL = new Set<MathClass>(['mbin', 'mopen', 'mrel', 'mop', 'mpunct'])
const RIGHT_CANCEL = new Set<MathClass>(['mrel', 'mclose', 'mpunct'])
const is_atom = (atom: MathMetrics) => atom.left !== 'none' || atom.right !== 'none'

// Effective classes belong to this occurrence in a row. Never reclassify the
// cached child fragment: the same '+' may be binary in another occurrence.
function cancel_binary_atoms(input: readonly MathMetrics[]): MathMetrics[] {
  const atoms = input.map(atom => ({ ...atom }))
  function cancel(index: number) {
    const atom = atoms[index]
    if (atom.left === 'mbin') atom.left = 'mord'
    if (atom.right === 'mbin') atom.right = 'mord'
  }
  let prev: number | undefined
  atoms.forEach((atom, i) => {
    if (!is_atom(atom)) return
    if (prev === undefined) { if (atom.left === 'mbin') cancel(i) }
    else {
      if (atoms[prev].right === 'mbin' && RIGHT_CANCEL.has(atom.left)) cancel(prev)
      if (atom.left === 'mbin' && LEFT_CANCEL.has(atoms[prev].right)) cancel(i)
    }
    prev = i
  })
  if (prev !== undefined && atoms[prev].right === 'mbin') cancel(prev)
  return atoms
}

function atom_spacing(left: MathClass, right: MathClass, script: boolean): number {
  if (script) return (right === 'mop' && ['mord', 'mop', 'mclose', 'minner'].includes(left)
    || left === 'mop' && right === 'mord') ? 3 / 18 : 0
  const mu = SPACING[left]?.[right] ?? 0
  return mu / 18
}

export { is_atom, cancel_binary_atoms, atom_spacing }
