// Copyright (c) 2025, 2026 Jon Verrier

export interface IExercise {
   exerciseId: string;
   name: string;
   category: string;
   primaryMovementPattern: string;
   notes?: string;
}

export interface IDatabaseClient {
   query<T>(sql: string, params: unknown[]): Promise<T[]>;
   execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>;
}

interface IRawExerciseRow {
   exercise_id: string;
   name: string;
   category: string;
   primary_movement_pattern: string;
   notes: string | null;
}

/**
 * Data access layer for exercises. Translates between the relational database schema
 * (snake_case columns) and the domain IExercise interface (camelCase properties).
 * All queries are parameterised to prevent SQL injection.
 */
export class ExerciseRepository {
   constructor(private readonly db: IDatabaseClient) {}

   /**
    * Maps a raw database row to an IExercise domain object.
    */
   private toExercise(row: IRawExerciseRow): IExercise {
      return {
         exerciseId:              row.exercise_id,
         name:                    row.name,
         category:                row.category,
         primaryMovementPattern:  row.primary_movement_pattern,
         notes:                   row.notes ?? undefined
      };
   }

   /**
    * Returns the exercise with the given ID, or null if not found.
    */
   async findById(exerciseId: string): Promise<IExercise | null> {
      const rows = await this.db.query<IRawExerciseRow>(
         'SELECT * FROM exercises WHERE exercise_id = ?',
         [exerciseId]
      );
      return rows.length > 0 ? this.toExercise(rows[0]) : null;
   }

   /**
    * Returns all exercises in the given category, ordered alphabetically by name.
    */
   async findByCategory(category: string): Promise<IExercise[]> {
      const rows = await this.db.query<IRawExerciseRow>(
         'SELECT * FROM exercises WHERE category = ? ORDER BY name',
         [category]
      );
      return rows.map(r => this.toExercise(r));
   }

   /**
    * Inserts a new exercise record and returns the saved domain object.
    */
   async create(exercise: Omit<IExercise, 'exerciseId'>, id: string): Promise<IExercise> {
      await this.db.execute(
         'INSERT INTO exercises (exercise_id, name, category, primary_movement_pattern, notes) VALUES (?, ?, ?, ?, ?)',
         [id, exercise.name, exercise.category, exercise.primaryMovementPattern, exercise.notes ?? null]
      );
      return { exerciseId: id, ...exercise };
   }

   /**
    * Deletes the exercise with the given ID. Returns true if a row was deleted.
    */
   async delete(exerciseId: string): Promise<boolean> {
      const result = await this.db.execute(
         'DELETE FROM exercises WHERE exercise_id = ?',
         [exerciseId]
      );
      return result.rowsAffected > 0;
   }
}
