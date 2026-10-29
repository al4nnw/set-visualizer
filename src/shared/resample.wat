;; The resampler's hot loop (jsKernel in dsp.ts) in WebAssembly SIMD, for the browser analysis.
;; It does the same arithmetic in the same order: each output is the dot product of a filter row
;; and the input window, products and sums in double, the taps four at a time into four running
;; sums (two f64x2 lanes each here), the leftover taps into the first, then the four added left
;; to right and rounded to float. So it gives jsKernel's output to the bit, about 5 times faster.
;; Compiled into resampleWasm.ts by `npm run build:wasm`.
(module
  (memory (export "memory") 1)

  ;; Outputs [0, count) into $out, from the input at $x (the first output's window starts there)
  ;; with the filter table at $table ($phases rows of $taps floats), starting at filter phase
  ;; $phase and stepping $down input positions per output in units of 1/$up. Pointers are bytes.
  (func (export "resample")
    (param $table i32) (param $taps i32) (param $up i32) (param $down i32) (param $phases i32)
    (param $x i32) (param $phase i32) (param $count i32) (param $out i32)
    (local $j i32) (local $i i32) (local $row i32) (local $xp i32) (local $start i32)
    (local $stepInt i32) (local $stepFrac i32) (local $exact i32) (local $taps4 i32)
    (local $a v128) (local $b v128) (local $acc0 f64)
    (local.set $stepInt (i32.div_u (local.get $down) (local.get $up)))
    (local.set $stepFrac (i32.rem_u (local.get $down) (local.get $up)))
    (local.set $exact (i32.eq (local.get $phases) (local.get $up)))
    ;; Taps taken four at a time: jsKernel's loop runs while i + 3 < taps.
    (local.set $taps4 (i32.and (local.get $taps) (i32.const -4)))
    (block $done
      (loop $outputs
        (br_if $done (i32.ge_u (local.get $j) (local.get $count)))
        ;; The filter row: the phase itself, or the nearest of $phases when there are fewer.
        (local.set $row
          (i32.add (local.get $table)
            (i32.shl
              (i32.mul
                (select
                  (local.get $phase)
                  (i32.div_u (i32.mul (local.get $phase) (local.get $phases)) (local.get $up))
                  (local.get $exact))
                (local.get $taps))
              (i32.const 2))))
        (local.set $xp (i32.add (local.get $x) (i32.shl (local.get $start) (i32.const 2))))
        ;; $a holds the running sums of taps 4k and 4k+1, $b those of 4k+2 and 4k+3.
        (local.set $a (f64x2.splat (f64.const 0)))
        (local.set $b (f64x2.splat (f64.const 0)))
        (local.set $i (i32.const 0))
        (block $d4
          (loop $l4
            (br_if $d4 (i32.ge_u (local.get $i) (local.get $taps4)))
            (local.set $a
              (f64x2.add (local.get $a)
                (f64x2.mul
                  (f64x2.promote_low_f32x4 (v128.load64_zero (i32.add (local.get $row) (i32.shl (local.get $i) (i32.const 2)))))
                  (f64x2.promote_low_f32x4 (v128.load64_zero (i32.add (local.get $xp) (i32.shl (local.get $i) (i32.const 2))))))))
            (local.set $b
              (f64x2.add (local.get $b)
                (f64x2.mul
                  (f64x2.promote_low_f32x4 (v128.load64_zero offset=8 (i32.add (local.get $row) (i32.shl (local.get $i) (i32.const 2)))))
                  (f64x2.promote_low_f32x4 (v128.load64_zero offset=8 (i32.add (local.get $xp) (i32.shl (local.get $i) (i32.const 2))))))))
            (local.set $i (i32.add (local.get $i) (i32.const 4)))
            (br $l4)))
        ;; The leftover taps go into the first sum, one at a time.
        (local.set $acc0 (f64x2.extract_lane 0 (local.get $a)))
        (block $d1
          (loop $l1
            (br_if $d1 (i32.ge_u (local.get $i) (local.get $taps)))
            (local.set $acc0
              (f64.add (local.get $acc0)
                (f64.mul
                  (f64.promote_f32 (f32.load (i32.add (local.get $row) (i32.shl (local.get $i) (i32.const 2)))))
                  (f64.promote_f32 (f32.load (i32.add (local.get $xp) (i32.shl (local.get $i) (i32.const 2))))))))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $l1)))
        ;; acc0 + acc1 + acc2 + acc3, left to right, as a float.
        (f32.store
          (i32.add (local.get $out) (i32.shl (local.get $j) (i32.const 2)))
          (f32.demote_f64
            (f64.add
              (f64.add
                (f64.add (local.get $acc0) (f64x2.extract_lane 1 (local.get $a)))
                (f64x2.extract_lane 0 (local.get $b)))
              (f64x2.extract_lane 1 (local.get $b)))))
        ;; The next output's window and phase.
        (local.set $start (i32.add (local.get $start) (local.get $stepInt)))
        (local.set $phase (i32.add (local.get $phase) (local.get $stepFrac)))
        (if (i32.ge_u (local.get $phase) (local.get $up))
          (then
            (local.set $phase (i32.sub (local.get $phase) (local.get $up)))
            (local.set $start (i32.add (local.get $start) (i32.const 1)))))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $outputs)))))
